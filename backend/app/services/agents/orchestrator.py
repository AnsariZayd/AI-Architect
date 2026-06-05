import json

from app.schemas.architecture import (
    ApiEndpoint,
    ArchitectureDesign,
    ArchitectureRequest,
    ArchitectureResponse,
    ColumnDef,
    DatabaseEntity,
    DatabaseRelation,
    DataFlow,
    ModuleDetail,
    RequirementAnalysis,
)
from app.services.agents.autogen_runner import autogen_runner
from app.services.diagram.mermaid_builder import build_er_diagram, build_mermaid
from app.services.llm.groq_client import groq_client
from app.services.llm.prompts import architecture_prompt
from app.services.storage.repository import repository


def _coerce_modules(raw: list) -> list[ModuleDetail]:
    """Accept either plain strings or dicts and return ModuleDetail list."""
    result = []
    for item in raw:
        if isinstance(item, str):
            result.append(ModuleDetail(name=item))
        elif isinstance(item, dict):
            result.append(ModuleDetail.model_validate(item))
        elif isinstance(item, ModuleDetail):
            result.append(item)
    return result


def _coerce_entities(raw: list) -> list[DatabaseEntity]:
    """Accept either plain strings or dicts and return DatabaseEntity list."""
    result = []
    for item in raw:
        if isinstance(item, str):
            result.append(DatabaseEntity(name=item))
        elif isinstance(item, dict):
            result.append(DatabaseEntity.model_validate(item))
        elif isinstance(item, DatabaseEntity):
            result.append(item)
    return result


def _coerce_relations(raw: list) -> list[DatabaseRelation]:
    result = []
    for item in raw:
        if isinstance(item, dict):
            result.append(DatabaseRelation.model_validate(item))
        elif isinstance(item, DatabaseRelation):
            result.append(item)
    return result


def _coerce_apis(raw: list) -> list[ApiEndpoint]:
    result = []
    for item in raw:
        if isinstance(item, dict):
            result.append(ApiEndpoint.model_validate(item))
        elif isinstance(item, ApiEndpoint):
            result.append(item)
    return result


def get_empty_architecture_fields(raw_arch: dict) -> list[str]:
    if not raw_arch or not isinstance(raw_arch, dict):
        return ["architecture"]
    
    empty_fields = []
    for field in ["modules", "database_entities", "database_relations", "apis", "data_flows", "tech_stack"]:
        val = raw_arch.get(field)
        if val is None or val == [] or val == {} or val == "":
            empty_fields.append(field)
    return empty_fields


class ArchitectOrchestrator:
    async def analyze(self, requirements: str) -> RequirementAnalysis:
        prompt = architecture_prompt(requirements, mode="analysis")
        result = await groq_client.generate_json(prompt)
        if result:
            return RequirementAnalysis.model_validate(result)
        return self._fallback_analysis(requirements)

    async def generate_architecture(
        self, payload: ArchitectureRequest
    ) -> ArchitectureResponse:
        generation_source = "local_fallback"
        autogen_result = await autogen_runner.run(payload.requirements)
        initial_architecture = None

        # Check if autogen was complete
        is_autogen_complete = False
        if autogen_result and "architecture" in autogen_result:
            if not get_empty_architecture_fields(autogen_result["architecture"]):
                is_autogen_complete = True
            else:
                print(f"Multi-agent pipeline response was incomplete. Missing/empty fields: {get_empty_architecture_fields(autogen_result['architecture'])}")

        if is_autogen_complete:
            generation_source = "autogen_multi_agent"
            analysis = RequirementAnalysis.model_validate(autogen_result["analysis"])
            raw_arch = autogen_result["architecture"]
            # Coerce mixed-format fields from LLM
            raw_arch["modules"] = _coerce_modules(raw_arch.get("modules", []))
            raw_arch["database_entities"] = _coerce_entities(raw_arch.get("database_entities", []))
            raw_arch["database_relations"] = _coerce_relations(raw_arch.get("database_relations", []))
            raw_arch["apis"] = _coerce_apis(raw_arch.get("apis", []))
            architecture = ArchitectureDesign.model_validate(raw_arch)

            raw_initial_arch = autogen_result.get("initial_architecture")
            if raw_initial_arch:
                raw_initial_arch["modules"] = _coerce_modules(raw_initial_arch.get("modules", []))
                raw_initial_arch["database_entities"] = _coerce_entities(raw_initial_arch.get("database_entities", []))
                raw_initial_arch["database_relations"] = _coerce_relations(raw_initial_arch.get("database_relations", []))
                raw_initial_arch["apis"] = _coerce_apis(raw_initial_arch.get("apis", []))
                initial_architecture = ArchitectureDesign.model_validate(raw_initial_arch)
        else:
            analysis = await self.analyze(payload.requirements)
            base_prompt = architecture_prompt(payload.requirements, mode="architecture")
            
            # Self-correction loop for single-pass generation using single-turn feedback prompts
            current_prompt = base_prompt
            raw_arch = None
            max_attempts = 3
            generation_source = "local_fallback"
            
            for attempt in range(max_attempts):
                result = await groq_client.generate_json(current_prompt)
                if not result:
                    print(f"Groq API call returned None on attempt {attempt+1}")
                    break
                
                arch_candidate = result.get("architecture", result)
                if not isinstance(arch_candidate, dict):
                    print(f"Result did not contain a valid architecture dictionary on attempt {attempt+1}")
                    current_prompt = base_prompt + "\n\nCRITICAL ERROR: Your previous response was invalid and could not be parsed as a valid architecture JSON structure. Please generate the COMPLETE JSON object from scratch."
                    continue

                empty_fields = get_empty_architecture_fields(arch_candidate)
                if not empty_fields:
                    raw_arch = arch_candidate
                    generation_source = "groq_single_pass"
                    break
                
                print(f"Groq single pass returned incomplete architecture on attempt {attempt+1}. Empty fields: {empty_fields}")
                current_prompt = base_prompt + (
                    f"\n\nCRITICAL ERROR: In your previous attempt, the following fields in the JSON response were empty or missing: {empty_fields}. "
                    f"You MUST fully populate them with realistic, detailed values. Empty lists '[]' or empty objects '{{}}' are invalid. "
                    f"Please regenerate the COMPLETE JSON object with all fields fully populated."
                )
            
            if raw_arch:
                raw_arch["modules"] = _coerce_modules(raw_arch.get("modules", []))
                raw_arch["database_entities"] = _coerce_entities(raw_arch.get("database_entities", []))
                raw_arch["database_relations"] = _coerce_relations(raw_arch.get("database_relations", []))
                raw_arch["apis"] = _coerce_apis(raw_arch.get("apis", []))
                architecture = ArchitectureDesign.model_validate(raw_arch)
            else:
                print("Single pass generation failed to return a complete architecture after all attempts. Falling back to local template.")
                architecture = self._fallback_architecture(payload.requirements, analysis)

        mermaid_code = build_mermaid(architecture)
        er_diagram_code = build_er_diagram(architecture)

        response = ArchitectureResponse(
            analysis=analysis,
            architecture=architecture,
            initial_architecture=initial_architecture,
            mermaid_code=mermaid_code,
            er_diagram_code=er_diagram_code,
            generation_source=generation_source,
        )
        if payload.project_id:
            repository.add_requirement(
                payload.project_id,
                payload.requirements,
                parsed_text=json.dumps(analysis.model_dump()),
            )
            version = repository.add_version(
                payload.project_id,
                json.loads(response.model_dump_json()),
                mermaid_code,
            )
            persisted = version is not None
            response.persisted = persisted
            response.version = version
        return response

    # ------------------------------------------------------------------ #
    #  Fallbacks                                                          #
    # ------------------------------------------------------------------ #

    def _fallback_analysis(self, requirements: str) -> RequirementAnalysis:
        lower = requirements.lower()
        actors = ["End User - primary consumer of the application"]
        if "admin" in lower:
            actors.append("Admin - manages system configuration and user accounts")
        if "customer" in lower:
            actors.append("Customer - places orders and manages their account")
        if "driver" in lower or "delivery" in lower:
            actors.append("Delivery Partner - fulfills delivery assignments")
        if "restaurant" in lower or "vendor" in lower:
            actors.append("Vendor/Restaurant - manages catalog and incoming orders")

        features = [
            line.strip("- ").strip()
            for line in requirements.splitlines()
            if len(line.strip()) > 8
        ][:10]
        if not features:
            features = [
                "User registration and authentication with email/password",
                "Capture and store project requirements",
                "Generate detailed system architecture from requirements",
                "Preview interactive architecture and ER diagrams",
                "Export architecture as Markdown document",
            ]

        return RequirementAnalysis(
            actors=actors,
            features=features,
            assumptions=[
                "The system will run as a web application with a REST API backend.",
                "PostgreSQL will be used as the primary relational database.",
                "Authentication will use JWT tokens with refresh token rotation.",
                "The initial deployment target is a single-region cloud environment.",
            ],
            ambiguities=[
                "Expected concurrent user count and performance SLAs are not specified.",
                "User roles and permission granularity need stakeholder confirmation.",
                "Data retention and backup policies are not defined.",
                "Third-party integration requirements are unclear.",
            ],
            missing_requirements=[
                "Non-functional requirements: latency targets, throughput, availability SLA",
                "Security: rate limiting, input validation, OWASP top-10 mitigations",
                "Monitoring and observability: logging, metrics, alerting",
                "Data privacy and compliance: GDPR, data encryption at rest/in-transit",
                "Disaster recovery and backup strategy",
            ],
        )

    def _fallback_architecture(
        self, requirements: str, analysis: RequirementAnalysis
    ) -> ArchitectureDesign:
        lower = requirements.lower()
        if "food" in lower or "restaurant" in lower or "delivery" in lower:
            return self._food_delivery_fallback()
        return self._generic_fallback(analysis)

    def _food_delivery_fallback(self) -> ArchitectureDesign:
        return ArchitectureDesign(
            modules=[
                ModuleDetail(
                    name="Customer Web App",
                    description="React SPA for customers to browse restaurants, place orders, and track deliveries.",
                    responsibilities=["Restaurant search and filtering", "Menu browsing and cart management", "Order placement and payment", "Real-time delivery tracking"],
                ),
                ModuleDetail(
                    name="Restaurant Portal",
                    description="Dashboard for restaurant owners to manage menus, view orders, and update availability.",
                    responsibilities=["Menu CRUD operations", "Order acceptance and rejection", "Availability schedule management", "Revenue and analytics dashboard"],
                ),
                ModuleDetail(
                    name="Delivery Partner App",
                    description="Mobile-optimized interface for delivery partners to accept and fulfill delivery tasks.",
                    responsibilities=["Delivery assignment acceptance", "GPS-based navigation", "Delivery status updates", "Earnings and history tracking"],
                ),
                ModuleDetail(
                    name="API Gateway",
                    description="Central entry point that routes requests, enforces rate limits, and handles authentication.",
                    responsibilities=["Request routing and load balancing", "JWT token validation", "Rate limiting and throttling", "Request/response logging"],
                ),
                ModuleDetail(
                    name="Auth Service",
                    description="Handles user registration, login, and role-based access control for all user types.",
                    responsibilities=["User registration with email verification", "Login with JWT issuance", "Password reset flow", "Role-based access control (customer, restaurant, driver, admin)"],
                ),
                ModuleDetail(
                    name="Menu Catalog Service",
                    description="Manages restaurant menus, categories, items, pricing, and availability.",
                    responsibilities=["Menu item CRUD", "Category management", "Price and availability updates", "Search indexing for restaurant discovery"],
                ),
                ModuleDetail(
                    name="Order Service",
                    description="Core order lifecycle management from cart creation to delivery completion.",
                    responsibilities=["Cart management", "Order creation and validation", "Order status state machine", "Order history and reordering"],
                ),
                ModuleDetail(
                    name="Payment Service",
                    description="Handles payment processing, refunds, and financial reconciliation.",
                    responsibilities=["Payment intent creation", "Payment gateway integration", "Refund processing", "Transaction audit logging"],
                ),
                ModuleDetail(
                    name="Dispatch Service",
                    description="Assigns delivery partners to orders based on proximity and availability.",
                    responsibilities=["Driver matching algorithm", "Route optimization", "ETA calculation", "Reassignment on timeout"],
                ),
                ModuleDetail(
                    name="Notification Service",
                    description="Sends real-time notifications via push, email, and SMS to all user types.",
                    responsibilities=["Order status notifications", "Promotional campaigns", "Driver assignment alerts", "Email and SMS delivery via providers"],
                ),
                ModuleDetail(
                    name="Admin Console",
                    description="Internal tool for operations team to monitor orders, manage disputes, and configure the platform.",
                    responsibilities=["Order monitoring and intervention", "User and restaurant management", "Dispute resolution", "Platform configuration and feature flags"],
                ),
            ],
            database_entities=[
                DatabaseEntity(
                    name="users",
                    description="Stores all user accounts across roles (customer, restaurant owner, driver, admin).",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="email", type="VARCHAR(255)", constraints=["UNIQUE", "NOT NULL"]),
                        ColumnDef(name="password_hash", type="VARCHAR(255)", constraints=["NOT NULL"]),
                        ColumnDef(name="full_name", type="VARCHAR(120)", constraints=["NOT NULL"]),
                        ColumnDef(name="phone", type="VARCHAR(20)", constraints=[]),
                        ColumnDef(name="role", type="VARCHAR(20)", constraints=["NOT NULL"]),
                        ColumnDef(name="is_verified", type="BOOLEAN", constraints=["DEFAULT FALSE"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="restaurants",
                    description="Restaurant profiles with location, operating hours, and ratings.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="owner_id", type="UUID", constraints=["FK(users)", "NOT NULL"]),
                        ColumnDef(name="name", type="VARCHAR(200)", constraints=["NOT NULL"]),
                        ColumnDef(name="description", type="TEXT", constraints=[]),
                        ColumnDef(name="address", type="TEXT", constraints=["NOT NULL"]),
                        ColumnDef(name="latitude", type="DECIMAL(10,7)", constraints=[]),
                        ColumnDef(name="longitude", type="DECIMAL(10,7)", constraints=[]),
                        ColumnDef(name="avg_rating", type="DECIMAL(2,1)", constraints=["DEFAULT 0"]),
                        ColumnDef(name="is_active", type="BOOLEAN", constraints=["DEFAULT TRUE"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="menu_items",
                    description="Individual food items belonging to a restaurant with pricing and availability.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="restaurant_id", type="UUID", constraints=["FK(restaurants)", "NOT NULL"]),
                        ColumnDef(name="name", type="VARCHAR(200)", constraints=["NOT NULL"]),
                        ColumnDef(name="description", type="TEXT", constraints=[]),
                        ColumnDef(name="price", type="DECIMAL(10,2)", constraints=["NOT NULL"]),
                        ColumnDef(name="category", type="VARCHAR(80)", constraints=[]),
                        ColumnDef(name="image_url", type="TEXT", constraints=[]),
                        ColumnDef(name="is_available", type="BOOLEAN", constraints=["DEFAULT TRUE"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="orders",
                    description="Customer orders with status tracking through the complete lifecycle.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="customer_id", type="UUID", constraints=["FK(users)", "NOT NULL"]),
                        ColumnDef(name="restaurant_id", type="UUID", constraints=["FK(restaurants)", "NOT NULL"]),
                        ColumnDef(name="status", type="VARCHAR(30)", constraints=["NOT NULL"]),
                        ColumnDef(name="total_amount", type="DECIMAL(10,2)", constraints=["NOT NULL"]),
                        ColumnDef(name="delivery_address", type="TEXT", constraints=["NOT NULL"]),
                        ColumnDef(name="delivery_lat", type="DECIMAL(10,7)", constraints=[]),
                        ColumnDef(name="delivery_lng", type="DECIMAL(10,7)", constraints=[]),
                        ColumnDef(name="estimated_delivery", type="TIMESTAMP", constraints=[]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="order_items",
                    description="Line items within an order linking to specific menu items with quantity and price.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="order_id", type="UUID", constraints=["FK(orders)", "NOT NULL"]),
                        ColumnDef(name="menu_item_id", type="UUID", constraints=["FK(menu_items)", "NOT NULL"]),
                        ColumnDef(name="quantity", type="INTEGER", constraints=["NOT NULL"]),
                        ColumnDef(name="unit_price", type="DECIMAL(10,2)", constraints=["NOT NULL"]),
                        ColumnDef(name="subtotal", type="DECIMAL(10,2)", constraints=["NOT NULL"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="payments",
                    description="Payment transactions linked to orders with gateway references and status.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="order_id", type="UUID", constraints=["FK(orders)", "UNIQUE", "NOT NULL"]),
                        ColumnDef(name="amount", type="DECIMAL(10,2)", constraints=["NOT NULL"]),
                        ColumnDef(name="currency", type="VARCHAR(3)", constraints=["DEFAULT 'USD'"]),
                        ColumnDef(name="method", type="VARCHAR(30)", constraints=["NOT NULL"]),
                        ColumnDef(name="gateway_ref", type="VARCHAR(255)", constraints=[]),
                        ColumnDef(name="status", type="VARCHAR(20)", constraints=["NOT NULL"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="delivery_assignments",
                    description="Delivery partner assignments to orders with real-time tracking data.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="order_id", type="UUID", constraints=["FK(orders)", "NOT NULL"]),
                        ColumnDef(name="driver_id", type="UUID", constraints=["FK(users)", "NOT NULL"]),
                        ColumnDef(name="status", type="VARCHAR(20)", constraints=["NOT NULL"]),
                        ColumnDef(name="picked_up_at", type="TIMESTAMP", constraints=[]),
                        ColumnDef(name="delivered_at", type="TIMESTAMP", constraints=[]),
                        ColumnDef(name="current_lat", type="DECIMAL(10,7)", constraints=[]),
                        ColumnDef(name="current_lng", type="DECIMAL(10,7)", constraints=[]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="reviews",
                    description="Customer reviews and ratings for restaurants and orders.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="order_id", type="UUID", constraints=["FK(orders)", "UNIQUE", "NOT NULL"]),
                        ColumnDef(name="customer_id", type="UUID", constraints=["FK(users)", "NOT NULL"]),
                        ColumnDef(name="restaurant_id", type="UUID", constraints=["FK(restaurants)", "NOT NULL"]),
                        ColumnDef(name="rating", type="INTEGER", constraints=["NOT NULL"]),
                        ColumnDef(name="comment", type="TEXT", constraints=[]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
            ],
            database_relations=[
                DatabaseRelation(from_table="restaurants", to_table="users", relation_type="many-to-one", via_column="owner_id"),
                DatabaseRelation(from_table="menu_items", to_table="restaurants", relation_type="many-to-one", via_column="restaurant_id"),
                DatabaseRelation(from_table="orders", to_table="users", relation_type="many-to-one", via_column="customer_id"),
                DatabaseRelation(from_table="orders", to_table="restaurants", relation_type="many-to-one", via_column="restaurant_id"),
                DatabaseRelation(from_table="order_items", to_table="orders", relation_type="many-to-one", via_column="order_id"),
                DatabaseRelation(from_table="order_items", to_table="menu_items", relation_type="many-to-one", via_column="menu_item_id"),
                DatabaseRelation(from_table="payments", to_table="orders", relation_type="one-to-one", via_column="order_id"),
                DatabaseRelation(from_table="delivery_assignments", to_table="orders", relation_type="many-to-one", via_column="order_id"),
                DatabaseRelation(from_table="delivery_assignments", to_table="users", relation_type="many-to-one", via_column="driver_id"),
                DatabaseRelation(from_table="reviews", to_table="orders", relation_type="one-to-one", via_column="order_id"),
                DatabaseRelation(from_table="reviews", to_table="users", relation_type="many-to-one", via_column="customer_id"),
                DatabaseRelation(from_table="reviews", to_table="restaurants", relation_type="many-to-one", via_column="restaurant_id"),
            ],
            external_services=[
                "Stripe / Payment Gateway - payment processing and refunds",
                "Google Maps API - geocoding, distance calculation, and route optimization",
                "Twilio / SMS Provider - SMS notifications and OTP verification",
                "SendGrid / Email Provider - transactional emails and marketing",
                "Firebase Cloud Messaging - push notifications to mobile apps",
                "Redis - session caching, rate limiting, and real-time order state",
            ],
            data_flows=[
                DataFlow(source="Customer", target="Customer Web App", label="Browse restaurants, search menu items"),
                DataFlow(source="Customer Web App", target="API Gateway", label="Authenticated REST API requests"),
                DataFlow(source="Restaurant Owner", target="Restaurant Portal", label="Manage menu, accept/reject orders"),
                DataFlow(source="Restaurant Portal", target="API Gateway", label="Menu CRUD and order management calls"),
                DataFlow(source="Delivery Partner", target="Delivery Partner App", label="Accept deliveries, update location"),
                DataFlow(source="Delivery Partner App", target="API Gateway", label="Assignment and tracking API calls"),
                DataFlow(source="API Gateway", target="Auth Service", label="Validate JWT tokens, check roles"),
                DataFlow(source="API Gateway", target="Menu Catalog Service", label="Restaurant and menu queries"),
                DataFlow(source="API Gateway", target="Order Service", label="Cart, order, and status operations"),
                DataFlow(source="API Gateway", target="Payment Service", label="Payment and refund requests"),
                DataFlow(source="API Gateway", target="Dispatch Service", label="Driver assignment and tracking"),
                DataFlow(source="Order Service", target="Payment Service", label="Trigger payment on order placement"),
                DataFlow(source="Payment Service", target="Stripe / Payment Gateway", label="Authorize and capture payment"),
                DataFlow(source="Order Service", target="Dispatch Service", label="Request delivery assignment"),
                DataFlow(source="Dispatch Service", target="Google Maps API", label="Calculate route and ETA"),
                DataFlow(source="Order Service", target="Notification Service", label="Trigger order status notifications"),
                DataFlow(source="Notification Service", target="Twilio / SMS Provider", label="Send SMS alerts"),
                DataFlow(source="Notification Service", target="SendGrid / Email Provider", label="Send email confirmations"),
                DataFlow(source="Notification Service", target="Firebase Cloud Messaging", label="Push notifications"),
                DataFlow(source="Admin", target="Admin Console", label="Monitor operations, resolve disputes"),
                DataFlow(source="Admin Console", target="API Gateway", label="Admin API calls with elevated privileges"),
            ],
            apis=[
                ApiEndpoint(method="POST", path="/api/auth/register", purpose="Register new user account",
                            description="Creates a new user account with email verification. Validates email uniqueness and password strength.",
                            request_body="{email: string, password: string, full_name: string, phone: string, role: 'customer'|'restaurant'|'driver'}",
                            response_body="{id: uuid, email: string, role: string, created_at: datetime}",
                            auth_required=False),
                ApiEndpoint(method="POST", path="/api/auth/login", purpose="Authenticate user and issue JWT",
                            description="Validates credentials and returns access + refresh tokens. Tracks login attempts for security.",
                            request_body="{email: string, password: string}",
                            response_body="{access_token: string, refresh_token: string, expires_in: integer, user: {id, email, role}}",
                            auth_required=False),
                ApiEndpoint(method="GET", path="/api/restaurants", purpose="List restaurants with filters",
                            description="Returns paginated list of active restaurants. Supports filtering by cuisine, rating, location radius, and search query.",
                            request_body="Query params: ?lat=&lng=&radius_km=&cuisine=&min_rating=&page=&limit=",
                            response_body="{restaurants: [{id, name, address, avg_rating, cuisine, distance_km}], total: integer, page: integer}",
                            auth_required=True),
                ApiEndpoint(method="GET", path="/api/restaurants/{id}/menu", purpose="Get restaurant menu",
                            description="Returns all menu items grouped by category for a specific restaurant. Only shows available items.",
                            request_body="Path param: restaurant id",
                            response_body="{restaurant_id: uuid, categories: [{name: string, items: [{id, name, description, price, image_url}]}]}",
                            auth_required=True),
                ApiEndpoint(method="POST", path="/api/cart/items", purpose="Add item to cart",
                            description="Adds a menu item to the customer's cart. Creates cart if none exists. Validates item availability.",
                            request_body="{menu_item_id: uuid, quantity: integer, special_instructions: string}",
                            response_body="{cart_id: uuid, items: [{menu_item_id, name, quantity, unit_price, subtotal}], total: decimal}",
                            auth_required=True),
                ApiEndpoint(method="POST", path="/api/orders", purpose="Place order from cart",
                            description="Converts cart to order, validates item availability, calculates total with taxes/fees, and initiates payment.",
                            request_body="{cart_id: uuid, delivery_address: string, delivery_lat: decimal, delivery_lng: decimal, payment_method: string}",
                            response_body="{order_id: uuid, status: string, total_amount: decimal, estimated_delivery: datetime}",
                            auth_required=True),
                ApiEndpoint(method="GET", path="/api/orders/{id}", purpose="Get order details and status",
                            description="Returns full order details including items, payment status, delivery tracking, and timeline.",
                            request_body="Path param: order id",
                            response_body="{id: uuid, status: string, items: [], total_amount: decimal, delivery: {driver_name, current_lat, current_lng, eta}, timeline: []}",
                            auth_required=True),
                ApiEndpoint(method="PATCH", path="/api/orders/{id}/status", purpose="Update order status",
                            description="Advances order through status state machine. Validates transitions. Used by restaurant and delivery partners.",
                            request_body="{status: 'accepted'|'preparing'|'ready'|'picked_up'|'delivered'|'cancelled'}",
                            response_body="{order_id: uuid, status: string, updated_at: datetime}",
                            auth_required=True),
                ApiEndpoint(method="POST", path="/api/payments/authorize", purpose="Authorize payment for order",
                            description="Creates payment intent with the payment gateway. Supports card, wallet, and COD methods.",
                            request_body="{order_id: uuid, amount: decimal, currency: string, method: string, token: string}",
                            response_body="{payment_id: uuid, status: 'authorized'|'captured'|'failed', gateway_ref: string}",
                            auth_required=True),
                ApiEndpoint(method="POST", path="/api/deliveries/{id}/accept", purpose="Accept delivery assignment",
                            description="Driver accepts a pending delivery assignment. Updates assignment status and notifies customer.",
                            request_body="{driver_lat: decimal, driver_lng: decimal}",
                            response_body="{assignment_id: uuid, order_id: uuid, pickup_address: string, delivery_address: string, estimated_earnings: decimal}",
                            auth_required=True),
                ApiEndpoint(method="PUT", path="/api/deliveries/{id}/location", purpose="Update driver live location",
                            description="Receives periodic GPS updates from delivery partner for real-time tracking.",
                            request_body="{lat: decimal, lng: decimal, heading: integer, speed: decimal}",
                            response_body="{status: 'ok'}",
                            auth_required=True),
                ApiEndpoint(method="POST", path="/api/reviews", purpose="Submit order review and rating",
                            description="Customer submits a review after order delivery. One review per order.",
                            request_body="{order_id: uuid, rating: integer(1-5), comment: string}",
                            response_body="{review_id: uuid, created_at: datetime}",
                            auth_required=True),
                ApiEndpoint(method="PUT", path="/api/restaurants/{id}/menu-items/{itemId}", purpose="Update menu item",
                            description="Restaurant owner updates menu item details, pricing, or availability.",
                            request_body="{name: string, description: string, price: decimal, category: string, is_available: boolean}",
                            response_body="{id: uuid, name: string, price: decimal, updated_at: datetime}",
                            auth_required=True),
                ApiEndpoint(method="GET", path="/api/admin/orders", purpose="Admin view of all orders",
                            description="Paginated list of all orders with filters for status, date range, and restaurant. Admin only.",
                            request_body="Query params: ?status=&from_date=&to_date=&restaurant_id=&page=&limit=",
                            response_body="{orders: [{id, customer_name, restaurant_name, status, total_amount, created_at}], total: integer}",
                            auth_required=True),
            ],
            deployment_style=(
                "React SPAs served via CloudFront CDN. FastAPI microservices behind an NGINX API gateway "
                "with JWT-based auth. Neon PostgreSQL for transactional data with read replicas. "
                "Redis for session caching, rate limiting, and real-time order state. "
                "Docker containers orchestrated with Kubernetes on AWS EKS. "
                "CI/CD via GitHub Actions with staging and production environments. "
                "Monitoring with Prometheus + Grafana, logging with ELK stack."
            ),
            tech_stack={
                "frontend": "React 18 with Vite, React Router, Zustand for state management",
                "backend": "Python FastAPI with async SQLAlchemy ORM",
                "database": "PostgreSQL 16 (Neon managed) with Redis 7 for caching",
                "cache": "Redis for session store, rate limiting, and pub/sub",
                "auth": "JWT access + refresh tokens with bcrypt password hashing",
                "deployment": "AWS EKS (Kubernetes), CloudFront CDN, GitHub Actions CI/CD",
            },
            risks=[
                "Payment and order creation must be idempotent to avoid duplicate charges - use idempotency keys.",
                "Restaurant menu availability can become stale during checkout - validate stock at order placement.",
                "Delivery assignment needs timeout and automatic reassignment if driver doesn't respond within 60 seconds.",
                "Role-based access control is required across customer, restaurant, delivery, and admin workflows - enforce at API gateway.",
                "High-frequency GPS location updates from drivers can overload the database - buffer in Redis and batch-write.",
                "Cart abandonment and stale carts need TTL-based cleanup to free reserved inventory.",
                "Payment gateway downtime should trigger graceful degradation with retry queues, not order failure.",
            ],
        )

    def _generic_fallback(self, analysis: RequirementAnalysis) -> ArchitectureDesign:
        return ArchitectureDesign(
            modules=[
                ModuleDetail(
                    name="React Frontend",
                    description="Single-page application providing the user interface for requirement input and architecture visualization.",
                    responsibilities=["Requirement text input and editing", "Architecture results display", "Mermaid diagram rendering", "Export and download functionality"],
                ),
                ModuleDetail(
                    name="FastAPI Backend",
                    description="REST API server handling request routing, validation, and orchestration of analysis and generation services.",
                    responsibilities=["Request validation and routing", "CORS and security middleware", "Error handling and logging", "Response serialization"],
                ),
                ModuleDetail(
                    name="Requirement Analyzer",
                    description="Extracts structured information from raw requirement text using LLM or heuristic analysis.",
                    responsibilities=["Actor and role identification", "Feature extraction and classification", "Ambiguity and gap detection", "Assumption inference"],
                ),
                ModuleDetail(
                    name="Architecture Generator",
                    description="Designs system architecture by determining modules, databases, APIs, and data flows from analyzed requirements.",
                    responsibilities=["Module decomposition", "Database schema design", "API endpoint generation", "Data flow mapping"],
                ),
                ModuleDetail(
                    name="Diagram Service",
                    description="Converts architecture designs into Mermaid diagram code for both flowcharts and ER diagrams.",
                    responsibilities=["Flowchart generation", "ER diagram generation", "Node layout and styling", "Diagram syntax validation"],
                ),
                ModuleDetail(
                    name="Database Repository",
                    description="Persistence layer managing projects, requirements, and versioned architecture snapshots.",
                    responsibilities=["Project CRUD operations", "Requirement storage", "Architecture version management", "Query and retrieval"],
                ),
            ],
            database_entities=[
                DatabaseEntity(
                    name="projects",
                    description="Top-level container for architecture drafts and their requirements.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="name", type="VARCHAR(120)", constraints=["NOT NULL"]),
                        ColumnDef(name="description", type="TEXT", constraints=["DEFAULT ''"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                        ColumnDef(name="updated_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="requirements",
                    description="Raw and parsed requirement text associated with a project.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="project_id", type="UUID", constraints=["FK(projects)", "NOT NULL"]),
                        ColumnDef(name="raw_text", type="TEXT", constraints=["NOT NULL"]),
                        ColumnDef(name="parsed_text", type="JSONB", constraints=[]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="architectures",
                    description="Versioned architecture snapshots with full JSON design and Mermaid diagram code.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="project_id", type="UUID", constraints=["FK(projects)", "NOT NULL"]),
                        ColumnDef(name="version", type="INTEGER", constraints=["NOT NULL"]),
                        ColumnDef(name="architecture_json", type="JSONB", constraints=["NOT NULL"]),
                        ColumnDef(name="mermaid_code", type="TEXT", constraints=["NOT NULL"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
                DatabaseEntity(
                    name="feedback",
                    description="User feedback and notes attached to specific architecture versions.",
                    columns=[
                        ColumnDef(name="id", type="UUID", constraints=["PK"]),
                        ColumnDef(name="architecture_id", type="UUID", constraints=["FK(architectures)", "NOT NULL"]),
                        ColumnDef(name="user_note", type="TEXT", constraints=["NOT NULL"]),
                        ColumnDef(name="created_at", type="TIMESTAMP", constraints=["NOT NULL"]),
                    ],
                ),
            ],
            database_relations=[
                DatabaseRelation(from_table="requirements", to_table="projects", relation_type="many-to-one", via_column="project_id"),
                DatabaseRelation(from_table="architectures", to_table="projects", relation_type="many-to-one", via_column="project_id"),
                DatabaseRelation(from_table="feedback", to_table="architectures", relation_type="many-to-one", via_column="architecture_id"),
            ],
            external_services=["Groq API - LLM inference for requirement analysis and architecture generation"],
            data_flows=[
                DataFlow(source="User", target="React Frontend", label="Enter project requirements text"),
                DataFlow(source="React Frontend", target="FastAPI Backend", label="POST /api/generate/architecture"),
                DataFlow(source="FastAPI Backend", target="Requirement Analyzer", label="Extract actors, features, assumptions"),
                DataFlow(source="Requirement Analyzer", target="Groq API", label="LLM completion for analysis JSON"),
                DataFlow(source="Requirement Analyzer", target="Architecture Generator", label="Pass structured analysis"),
                DataFlow(source="Architecture Generator", target="Groq API", label="LLM completion for architecture JSON"),
                DataFlow(source="Architecture Generator", target="Diagram Service", label="Convert design to Mermaid code"),
                DataFlow(source="FastAPI Backend", target="Database Repository", label="Persist versioned architecture"),
                DataFlow(source="Database Repository", target="FastAPI Backend", label="Return version number"),
                DataFlow(source="FastAPI Backend", target="React Frontend", label="Return architecture + diagrams JSON"),
            ],
            apis=[
                ApiEndpoint(method="GET", path="/api/health", purpose="Backend readiness check",
                            description="Returns backend status, database connectivity, and LLM service availability.",
                            request_body="None", response_body="{status: string, db: string, llm: string}",
                            auth_required=False),
                ApiEndpoint(method="POST", path="/api/generate/analyze", purpose="Analyze requirements text",
                            description="Extracts actors, features, assumptions, ambiguities, and missing requirements from raw text.",
                            request_body="{requirements: string(min 10 chars)}",
                            response_body="{actors: string[], features: string[], assumptions: string[], ambiguities: string[], missing_requirements: string[]}",
                            auth_required=False),
                ApiEndpoint(method="POST", path="/api/generate/architecture", purpose="Generate full architecture",
                            description="Analyzes requirements and generates complete system architecture with modules, database schema, APIs, data flows, and diagrams.",
                            request_body="{project_id: uuid|null, requirements: string(min 10 chars)}",
                            response_body="{analysis: {...}, architecture: {...}, mermaid_code: string, er_diagram_code: string, generation_source: string, persisted: boolean, version: integer|null}",
                            auth_required=False),
                ApiEndpoint(method="POST", path="/api/projects", purpose="Create a new project",
                            description="Creates a named project container that can hold multiple requirement and architecture versions.",
                            request_body="{name: string(1-120 chars), description: string}",
                            response_body="{id: uuid, name: string, description: string, created_at: datetime}",
                            auth_required=False),
                ApiEndpoint(method="GET", path="/api/projects", purpose="List all projects",
                            description="Returns all projects ordered by creation date descending.",
                            request_body="None",
                            response_body="{projects: [{id, name, description, created_at}]}",
                            auth_required=False),
                ApiEndpoint(method="GET", path="/api/projects/{id}/versions", purpose="List architecture versions",
                            description="Returns all versioned architecture snapshots for a project.",
                            request_body="Path param: project id",
                            response_body="{versions: [{version, architecture_json, mermaid_code, created_at}]}",
                            auth_required=False),
            ],
            deployment_style=(
                "React static build served by CDN (Vercel or CloudFront). FastAPI backend deployed as a "
                "Docker container on Railway or AWS ECS. Neon PostgreSQL for persistent storage. "
                "CI/CD via GitHub Actions with lint, test, and deploy stages."
            ),
            tech_stack={
                "frontend": "React 18 with Vite, Mermaid.js for diagrams",
                "backend": "Python FastAPI with Pydantic validation",
                "database": "PostgreSQL (Neon managed)",
                "cache": "In-memory (LRU) for LLM response caching",
                "auth": "None currently - API key based in future",
                "deployment": "Docker + Railway or Vercel + AWS",
            },
            risks=analysis.ambiguities
            + [
                "LLM output must be validated against Pydantic schemas before storage or rendering to prevent injection.",
                "Large requirement texts may exceed Groq token limits - implement chunking or summarization.",
                "Mermaid diagram syntax errors from LLM output should be caught gracefully with fallback rendering.",
            ],
        )


architect_orchestrator = ArchitectOrchestrator()
