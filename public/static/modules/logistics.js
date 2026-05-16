// BF Deliver - Logistics Module (loaded by BF Ops parent shell)
// Functions stay global so inline onclick handlers work.
// NOTE: API and currentUser are already declared by shell.js — reassign, don't redeclare.

var API = axios.create({ baseURL: '/api' });
var currentUser = null;
var currentPage = 'dashboard';
var sidebarOpen = false;

// ==================== I18N - INTERNATIONALIZATION ====================
var currentLang = localStorage.getItem('bf_lang') || 'en';

var translations = {
  en: {
    // Login
    login_title: 'BF Deliver',
    login_subtitle: 'British Feed & Supplies Delivery Management',
    login_email: 'Email',
    login_password: 'Password',
    login_email_placeholder: 'Enter your email',
    login_password_placeholder: 'Enter your password',
    login_submit: 'Sign In',
    login_quick: 'Quick Login (Demo)',
    login_invalid: 'Invalid email or password',
    login_welcome: 'Welcome',
    // Language selector
    lang_label: 'Language',
    lang_en: 'English',
    lang_es: 'Español',
    lang_ht: 'Kreyòl',
    // Sidebar
    sidebar_subtitle: 'British Feed & Supplies',
    sidebar_driver_mode: 'Driver Mode',
    sidebar_signout: 'Sign Out',
    nav_operations: 'Operations',
    nav_dashboard: 'Dashboard',
    nav_orders: 'Orders',
    nav_schedule: 'Schedule',
    nav_routes: 'Routes',
    nav_resources: 'Resources',
    nav_customers: 'Customers',
    nav_products: 'Products',
    nav_fleet: 'Fleet',
    nav_delivery: 'Delivery',
    nav_driver_view: 'Driver View',
    nav_packing_lists: 'Packing Lists',
    nav_my_route: 'My Route',
    nav_todays_route: "Today's Route",
    // Dashboard
    dash_todays_orders: "Today's Orders",
    dash_pending_orders: 'Pending Orders',
    dash_in_transit: 'In Transit',
    dash_urgent_orders: 'Urgent Orders',
    dash_completed_today: 'Completed Today',
    dash_active_customers: 'Active Customers',
    dash_products: 'Products',
    dash_total_orders: 'Total Orders',
    dash_todays_routes: "Today's Routes",
    dash_no_routes: 'No routes today',
    dash_recent_orders: 'Recent Orders',
    dash_view_all: 'View All',
    dash_order: 'Order',
    dash_customer: 'Customer',
    dash_status: 'Status',
    dash_priority: 'Priority',
    dash_order_status: 'Order Status Breakdown',
    dash_priority_breakdown: 'Active Priority Breakdown',
    dash_unassigned: 'Unassigned',
    dash_no_truck: 'No truck',
    dash_error_loading: 'Error loading dashboard',
    // Orders page
    orders_title: 'Orders',
    orders_search: 'Search orders...',
    orders_new: 'New Order',
    orders_scan: 'Scan Ticket',
    orders_date: 'Date',
    orders_pallets: 'Pallets',
    orders_address: 'Address',
    orders_actions: 'Actions',
    orders_no_orders: 'No orders found',
    orders_create_first: 'Create your first order to get started.',
    // Order detail
    order_details: 'Order Details',
    order_items: 'Order Items',
    order_ticket_image: 'Ticket Image',
    order_view_image: 'View Ticket Image',
    order_edit: 'Edit',
    order_delete: 'Delete',
    order_back: 'Back to Orders',
    order_special_instructions: 'Special Instructions',
    order_none: 'None',
    order_created: 'Created',
    order_delivery_address: 'Delivery Address',
    order_change_addr: 'Change',
    order_edit_addr: 'Edit Address',
    order_new_addr: 'Add New Address',
    order_edit_customer: 'Edit Customer',
    order_product: 'Product',
    order_sku: 'SKU',
    order_quantity: 'Qty',
    order_no_items: 'No items yet',
    order_total_pallets: 'Est. Pallets',
    // New/Edit Order form
    form_customer: 'Customer',
    form_select_customer: '-- Select Customer --',
    form_add_new_customer: '+ Add New Customer',
    form_address: 'Delivery Address',
    form_select_address: '-- Select Address --',
    form_add_new_address: '+ Add New Address',
    form_order_number: 'Order #',
    form_order_number_placeholder: 'From ticket or auto-generated',
    form_priority: 'Priority',
    form_date: 'Scheduled Date',
    form_instructions: 'Special Instructions',
    form_items: 'Order Items',
    form_add_item: 'Add Item',
    form_select_product: '-- Select Product --',
    form_add_new_product: '+ Add New Product',
    form_cancel: 'Cancel',
    form_save: 'Save Changes',
    form_create: 'Create Order',
    // Edit Order Modal
    edit_order_title: 'Edit Order',
    edit_order_number: 'Order Number',
    edit_priority: 'Priority',
    edit_scheduled_date: 'Scheduled Date',
    edit_instructions: 'Special Instructions',
    // Driver view
    driver_todays_route: "Today's Route",
    driver_stops_complete: 'Stops Complete',
    driver_delivery_stops: 'Delivery Stops',
    driver_total_load: 'total load',
    driver_gate_code: 'Gate Code',
    driver_navigate: 'Navigate',
    driver_arrived: 'Arrived',
    driver_complete_photo: 'Complete + Photo',
    driver_delivered: 'Delivered',
    driver_at: 'at',
    driver_view_proof: 'View Proof',
    driver_all_complete: 'All Deliveries Complete!',
    driver_great_job: 'Great job! Head back to the distribution center.',
    driver_navigate_base: 'Navigate to Base',
    driver_no_route: 'No Route Assigned',
    driver_no_route_msg: "You don't have a route for today. Check back later or contact dispatch.",
    driver_dist_center: 'Distribution Center',
    driver_packing_list: 'Packing List',
    driver_items: 'items',
    driver_item: 'item',
    driver_no_items: 'No items on this order',
    driver_total: 'Total',
    driver_error: 'Error loading route',
    driver_status_updated: 'Status updated',
    driver_delivery_completed: 'Delivery completed!',
    driver_arrived_stop: 'Arrived at stop!',
    driver_update_failed: 'Failed to update',
    // Delivery proof
    proof_title: 'Delivery Proof',
    proof_take_photo: 'Take Photo',
    proof_upload_photo: 'Upload Photo',
    proof_notes: 'Delivery Notes',
    proof_notes_placeholder: 'Any delivery notes...',
    proof_submit: 'Submit Proof & Complete',
    proof_photo_required: 'Please take or upload a photo first',
    proof_success: 'Delivery proof submitted!',
    proof_fail: 'Failed to submit proof',
    // Packing list
    packing_title: 'Packing Lists',
    packing_select_route: 'Select a route to view its packing list',
    packing_stops: 'Stops',
    packing_total_items: 'Total Items',
    packing_total_items_count: 'Total Items',
    packing_loading_order: 'Loading Order (LIFO - Last stop loaded first)',
    packing_stop: 'Stop',
    packing_special: 'Special Instructions',
    packing_print: 'Print Packing List',
    packing_driver: 'Driver',
    packing_truck: 'Truck',
    packing_capacity: 'Capacity',
    packing_over_capacity: 'Over capacity!',
    // Routes
    routes_title: 'Routes',
    routes_new: 'New Route',
    routes_stops: 'Stops',
    routes_miles: 'miles',
    routes_no_routes: 'No routes found',
    // Route detail & map
    route_optimize: 'Optimize Route',
    route_optimizing: 'Optimizing route order...',
    route_optimized: 'Route Optimized!',
    route_saved: 'Saved',
    route_miles_saved: 'Miles Saved',
    route_total_distance: 'Total Distance',
    route_est_time: 'Est. Time',
    route_drive: 'Drive',
    route_fuel: 'Fuel',
    route_map: 'Route Map',
    route_progress: 'Progress',
    route_distance: 'Distance',
    route_stops: 'Stops',
    route_leg: 'Leg',
    route_notes: 'Notes',
    route_add_note: 'Add note',
    route_enter_note: 'Enter dispatch note for this stop:',
    route_note_saved: 'Note saved',
    route_reordered: 'Stop order updated',
    route_add_stop: 'Add Stop',
    route_stop_added: 'Stop added to route',
    route_stop_removed: 'Stop removed from route',
    route_remove_stop: 'Remove Stop',
    route_view_property: 'View Property (Satellite)',
    route_property_view: 'Property View',
    // Driver enhancements
    driver_route_map: 'Route Overview Map',
    driver_next_stop: 'Next Stop',
    driver_go: 'GO',
    // Trucks
    trucks_title: 'Fleet Management',
    trucks_capacity: 'Capacity',
    trucks_plate: 'Plate',
    // Customers
    customers_title: 'Customers',
    customers_new: 'New Customer',
    customers_phone: 'Phone',
    customers_type: 'Type',
    customers_orders_count: 'orders',
    // Products
    products_title: 'Products',
    products_new: 'New Product',
    products_category: 'Category',
    products_price: 'Price',
    products_stock: 'Stock',
    products_per_unit: 'per unit',
    // Schedule
    schedule_title: 'Schedule',
    // Delivery Zones
    zones_title: 'Delivery Zones',
    zones_new: 'New Zone',
    zones_edit: 'Edit Zone',
    zones_name: 'Zone Name',
    zones_color: 'Color',
    zones_delivery_days: 'Delivery Days',
    zones_radius: 'Radius (mi)',
    zones_center: 'Center Point',
    zones_city_pattern: 'City Pattern',
    zones_zip_codes: 'ZIP Codes',
    zones_addresses: 'Addresses',
    zones_draw_on_map: 'Draw on Map',
    zones_click_to_set: 'Click map to set center',
    zones_no_zones: 'No delivery zones configured',
    zones_create_first: 'Create zones to organize deliveries by area and day.',
    zones_schedule: 'Zone Schedule',
    zones_auto_assign: 'Auto-Assign Addresses',
    zones_assigned: 'addresses assigned',
    zones_boundary: 'Boundary',
    zones_notes: 'Notes',
    zones_delete_confirm: 'Delete this zone? Addresses will be unassigned.',
    zones_is_zone_day: 'Zone delivery day',
    zones_not_zone_day: 'Not zone delivery day',
    // Smart Route Builder
    smart_build_title: 'Smart Route Builder',
    smart_build_btn: 'Smart Build',
    smart_build_desc: 'Auto-pick orders by zone & capacity',
    smart_build_preview: 'Route Preview',
    smart_build_confirm: 'Create This Route',
    smart_build_pallets: 'Pallets',
    smart_build_pallets: 'Pallets',
    smart_build_stops: 'Stops',
    smart_build_miles: 'Est. Miles',
    smart_build_fuel: 'Fuel',
    smart_build_remaining: 'remaining orders',
    smart_build_no_orders: 'No matching orders found',
    smart_build_zone_filter: 'Filter by Zone',
    smart_build_all_zones: 'All Zones (auto)',
    // Common
    common_loading: 'Loading...',
    common_error: 'Error',
    common_save: 'Save',
    common_cancel: 'Cancel',
    common_delete: 'Delete',
    common_close: 'Close',
    common_confirm: 'Confirm',
    common_yes: 'Yes',
    common_no: 'No',
    common_search: 'Search...',
    common_total: 'Total',
    common_pallets: 'Pallets',
    common_lbs: 'lbs',
    common_status: 'Status',
    common_date: 'Date',
    common_name: 'Name',
    // Priority/Status labels
    priority_urgent: 'urgent',
    priority_high: 'high',
    priority_normal: 'normal',
    priority_low: 'low',
    status_new: 'new',
    status_confirmed: 'confirmed',
    status_scheduled: 'scheduled',
    status_loaded: 'loaded',
    status_in_transit: 'in transit',
    status_delivered: 'delivered',
    status_completed: 'completed',
    status_pending: 'pending',
    status_arrived: 'arrived',
    status_failed: 'failed',
    status_on_hold: 'on hold',
    // Hold orders
    hold_title: 'Temporary Hold',
    hold_put: 'Put on Hold',
    hold_release: 'Release Hold',
    hold_reason: 'Hold Reason',
    hold_reason_placeholder: 'e.g. Waiting for customer confirmation...',
    hold_recurring: 'Recurring customer order awaiting confirmation',
    hold_released: 'Order released from hold',
    hold_placed: 'Order placed on hold',
    // Recurring orders
    recurring_title: 'Recurring Orders',
    recurring_new: 'New Recurring Schedule',
    recurring_edit: 'Edit Schedule',
    recurring_frequency: 'Frequency',
    recurring_weekly: 'Weekly',
    recurring_biweekly: 'Every 2 Weeks',
    recurring_monthly: 'Monthly',
    recurring_custom: 'Custom',
    recurring_interval: 'Every X days',
    recurring_day_of_week: 'Day of Week',
    recurring_day_of_month: 'Day of Month',
    recurring_next_delivery: 'Next Delivery',
    recurring_last_generated: 'Last Generated',
    recurring_auto_confirm: 'Auto-confirm orders',
    recurring_auto_confirm_desc: 'Automatically confirm generated orders (skip manual review)',
    recurring_status_active: 'Active',
    recurring_status_paused: 'Paused',
    recurring_status_cancelled: 'Cancelled',
    recurring_generate: 'Generate Now',
    recurring_skip: 'Skip Next',
    recurring_skip_reason: 'Skip Reason',
    recurring_skip_reason_placeholder: 'e.g. Customer on vacation...',
    recurring_pause: 'Pause Schedule',
    recurring_resume: 'Resume Schedule',
    recurring_cancel: 'Cancel Schedule',
    recurring_orders_generated: 'Orders Generated',
    recurring_history: 'Generation History',
    recurring_generated: 'Generated',
    recurring_skipped: 'Skipped',
    recurring_no_schedules: 'No recurring schedules yet',
    recurring_create_first: 'Set up recurring orders for customers with regular deliveries',
    recurring_badge: 'Recurring',
    recurring_from_schedule: 'From recurring schedule',
    recurring_view_schedule: 'View Schedule',
    recurring_generate_due: 'Generate All Due',
    recurring_generated_success: 'Order generated successfully',
    recurring_skipped_success: 'Next delivery skipped',
    recurring_make_recurring: 'Make Recurring',
    recurring_items_template: 'Items (same products each delivery)',
    nav_recurring: 'Recurring',
    // Driver-truck assignments
    assign_trucks: 'Assigned Trucks',
    assign_add_truck: 'Assign Truck',
    assign_primary: 'Primary',
    assign_set_primary: 'Set as Primary',
    assign_no_trucks: 'No trucks assigned to this driver',
    // Route assignment
    route_assign_driver: 'Assign Driver',
    route_assign_truck: 'Assign Truck',
    route_change_driver: 'Change Driver',
    route_change_truck: 'Change Truck',
    route_assigned: 'Assigned successfully',
    route_driver_trucks_only: 'Showing trucks this driver can operate',
    // Street view
    street_view: 'Street View',
    street_view_open: 'Open Street View',
    street_view_na: 'Street view requires coordinates',
    // Inline creation
    inline_new_customer: 'New Customer',
    inline_business_name: 'Business Name',
    inline_contact_name: 'Contact Name',
    inline_phone: 'Phone',
    inline_email: 'Email',
    inline_customer_type: 'Type',
    inline_new_product: 'New Product',
    inline_product_name: 'Product Name',
    inline_product_sku: 'SKU',
    inline_product_category: 'Category',
    inline_weight_per_unit: 'Weight/Unit (lbs)',
    inline_unit_type: 'Unit Type',
    inline_product_price: 'Price',
    inline_add: 'Add',
    // OCR/Scan
    scan_title: 'Scan Delivery Ticket',
    scan_capture: 'Capture Photo',
    scan_upload: 'Upload Image',
    scan_processing: 'Processing ticket with OCR...',
    scan_success: 'Ticket scanned successfully!',
    scan_fail: 'OCR scan failed',
    // Address modal
    addr_edit_title: 'Edit Address',
    addr_new_title: 'New Address',
    addr_label: 'Label',
    addr_street: 'Street',
    addr_city: 'City',
    addr_state: 'State',
    addr_zip: 'ZIP',
    addr_gate_code: 'Gate Code',
    addr_driver_notes: 'Driver Notes',
    addr_primary: 'Primary Address',
    // Customer edit modal
    cust_edit_title: 'Edit Customer',
    cust_business: 'Business Name',
    cust_contact: 'Contact Name',
    cust_phone: 'Phone',
    cust_email: 'Email',
    cust_type: 'Type',
    cust_notes: 'Notes',
    // Product dimensions
    prod_edit: 'Edit Product',
    prod_pallet_qty: 'Units/Pallet',
    prod_pallet_weight: 'Pallet Weight (lbs)',
    prod_length: 'Length (in)',
    prod_width: 'Width (in)',
    prod_height: 'Height (in)',
    prod_stackable: 'Stackable',
    prod_max_stack: 'Max Stack',
    prod_dimensions: 'Dimensions & Pallet Info',
    // (Dispatch Rules translations removed — feature replaced by AI Learning Engine)
    // Truck Loading
    loading_title: 'Truck Loading Plan',
    loading_optimize: 'Optimize Loading',
    loading_position: 'Position',
    loading_instruction: 'Loading Instruction',
    loading_warnings: 'Warnings',
    // Translate Instructions
    translate_instructions: 'Translate',
    translate_to_spanish: 'Spanish',
    translate_to_creole: 'Creole',
    translate_original: 'Original',
    // Orders by status
    orders_section_action: 'Action Required',
    orders_section_scheduled: 'Scheduled & In Progress',
    orders_section_completed: 'Completed',
    // Drivers management
    nav_drivers: 'Drivers',
    drivers_title: 'Driver Management',
    drivers_new: 'Add Driver',
    drivers_preferred_lang: 'Preferred Language',
    drivers_role: 'Role',
    drivers_active: 'Active',
    // Fleet Maintenance
    nav_maintenance: 'Maintenance',
    maint_title: 'Fleet Maintenance',
    maint_new_service: 'Schedule Service',
    maint_reminders: 'Upcoming Reminders',
    maint_issues: 'Driver-Reported Issues',
    maint_records: 'Records & Documents',
    maint_report_issue: 'Report Issue',
    maint_service_type: 'Service Type',
    maint_description: 'Description',
    maint_scheduled_date: 'Scheduled Date',
    maint_cost: 'Cost',
    maint_vendor: 'Vendor',
    maint_severity: 'Severity',
    maint_category: 'Category',
    maint_upload_record: 'Upload Record',
    maint_no_records: 'No maintenance records yet.',
    maint_no_issues: 'No issues reported.',
    // Product bag dimensions
    prod_bag_length: 'Bag Length (in)',
    prod_bag_width: 'Bag Width (in)',
    prod_bag_height: 'Bag Height (in)',
    prod_bag_dims: 'Individual Bag/Unit Dimensions',
    prod_auto_calc: 'Auto-calculated from bag dimensions',
    // Archive
    archive: 'Archive',
    archive_restore: 'Restore',
    archive_confirm: 'Are you sure you want to archive this item?',
    archive_restore_confirm: 'Restore this item?',
    archive_success: 'Archived successfully',
    archive_restore_success: 'Restored successfully',
    archive_show: 'Show Archived',
    archive_hide: 'Hide Archived',
    archive_badge: 'Archived',
    archive_empty: 'No archived items',
    archive_section: 'Archived',
  },
  es: {
    // Login
    login_title: 'BF Deliver',
    login_subtitle: 'British Feed & Supplies - Gestión de Entregas',
    login_email: 'Correo Electrónico',
    login_password: 'Contraseña',
    login_email_placeholder: 'Ingrese su correo electrónico',
    login_password_placeholder: 'Ingrese su contraseña',
    login_submit: 'Iniciar Sesión',
    login_quick: 'Acceso Rápido (Demo)',
    login_invalid: 'Correo o contraseña inválidos',
    login_welcome: 'Bienvenido',
    // Language
    lang_label: 'Idioma',
    lang_en: 'English',
    lang_es: 'Español',
    lang_ht: 'Kreyòl',
    // Sidebar
    sidebar_subtitle: 'British Feed & Supplies',
    sidebar_driver_mode: 'Modo Conductor',
    sidebar_signout: 'Cerrar Sesión',
    nav_operations: 'Operaciones',
    nav_dashboard: 'Panel',
    nav_orders: 'Pedidos',
    nav_schedule: 'Horario',
    nav_routes: 'Rutas',
    nav_resources: 'Recursos',
    nav_customers: 'Clientes',
    nav_products: 'Productos',
    nav_fleet: 'Flota',
    nav_delivery: 'Entregas',
    nav_driver_view: 'Vista del Conductor',
    nav_packing_lists: 'Listas de Empaque',
    nav_my_route: 'Mi Ruta',
    nav_todays_route: 'Ruta de Hoy',
    // Dashboard
    dash_todays_orders: 'Pedidos de Hoy',
    dash_pending_orders: 'Pedidos Pendientes',
    dash_in_transit: 'En Tránsito',
    dash_urgent_orders: 'Pedidos Urgentes',
    dash_completed_today: 'Completados Hoy',
    dash_active_customers: 'Clientes Activos',
    dash_products: 'Productos',
    dash_total_orders: 'Total de Pedidos',
    dash_todays_routes: 'Rutas de Hoy',
    dash_no_routes: 'Sin rutas hoy',
    dash_recent_orders: 'Pedidos Recientes',
    dash_view_all: 'Ver Todos',
    dash_order: 'Pedido',
    dash_customer: 'Cliente',
    dash_status: 'Estado',
    dash_priority: 'Prioridad',
    dash_order_status: 'Desglose por Estado',
    dash_priority_breakdown: 'Desglose por Prioridad',
    dash_unassigned: 'Sin asignar',
    dash_no_truck: 'Sin camión',
    dash_error_loading: 'Error cargando panel',
    // Orders
    orders_title: 'Pedidos',
    orders_search: 'Buscar pedidos...',
    orders_new: 'Nuevo Pedido',
    orders_scan: 'Escanear Ticket',
    orders_date: 'Fecha',
    orders_pallets: 'Paletas',
    orders_address: 'Dirección',
    orders_actions: 'Acciones',
    orders_no_orders: 'No se encontraron pedidos',
    orders_create_first: 'Cree su primer pedido para comenzar.',
    // Order detail
    order_details: 'Detalles del Pedido',
    order_items: 'Artículos del Pedido',
    order_ticket_image: 'Imagen del Ticket',
    order_view_image: 'Ver Imagen del Ticket',
    order_edit: 'Editar',
    order_delete: 'Eliminar',
    order_back: 'Volver a Pedidos',
    order_special_instructions: 'Instrucciones Especiales',
    order_none: 'Ninguna',
    order_created: 'Creado',
    order_delivery_address: 'Dirección de Entrega',
    order_change_addr: 'Cambiar',
    order_edit_addr: 'Editar Dirección',
    order_new_addr: 'Nueva Dirección',
    order_edit_customer: 'Editar Cliente',
    order_product: 'Producto',
    order_sku: 'SKU',
    order_quantity: 'Cant.',
    order_no_items: 'Sin artículos aún',
    order_total_pallets: 'Paletas Est.',
    // New/Edit order form
    form_customer: 'Cliente',
    form_select_customer: '-- Seleccionar Cliente --',
    form_add_new_customer: '+ Agregar Nuevo Cliente',
    form_address: 'Dirección de Entrega',
    form_select_address: '-- Seleccionar Dirección --',
    form_add_new_address: '+ Agregar Nueva Dirección',
    form_order_number: 'N° Pedido',
    form_order_number_placeholder: 'Del ticket o auto-generado',
    form_priority: 'Prioridad',
    form_date: 'Fecha Programada',
    form_instructions: 'Instrucciones Especiales',
    form_items: 'Artículos del Pedido',
    form_add_item: 'Agregar Artículo',
    form_select_product: '-- Seleccionar Producto --',
    form_add_new_product: '+ Agregar Nuevo Producto',
    form_cancel: 'Cancelar',
    form_save: 'Guardar Cambios',
    form_create: 'Crear Pedido',
    // Edit Order Modal
    edit_order_title: 'Editar Pedido',
    edit_order_number: 'Número de Pedido',
    edit_priority: 'Prioridad',
    edit_scheduled_date: 'Fecha Programada',
    edit_instructions: 'Instrucciones Especiales',
    // Driver
    driver_todays_route: 'Ruta de Hoy',
    driver_stops_complete: 'Paradas Completadas',
    driver_delivery_stops: 'Paradas de Entrega',
    driver_total_load: 'carga total',
    driver_gate_code: 'Código de Portón',
    driver_navigate: 'Navegar',
    driver_arrived: 'Llegué',
    driver_complete_photo: 'Completar + Foto',
    driver_delivered: 'Entregado',
    driver_at: 'a las',
    driver_view_proof: 'Ver Prueba',
    driver_all_complete: '¡Todas las Entregas Completadas!',
    driver_great_job: '¡Buen trabajo! Regresa al centro de distribución.',
    driver_navigate_base: 'Navegar a la Base',
    driver_no_route: 'Sin Ruta Asignada',
    driver_no_route_msg: 'No tienes una ruta para hoy. Consulta más tarde o contacta a despacho.',
    driver_dist_center: 'Centro de Distribución',
    driver_packing_list: 'Lista de Empaque',
    driver_items: 'artículos',
    driver_item: 'artículo',
    driver_no_items: 'Sin artículos en este pedido',
    driver_total: 'Total',
    driver_error: 'Error cargando ruta',
    driver_status_updated: 'Estado actualizado',
    driver_delivery_completed: '¡Entrega completada!',
    driver_arrived_stop: '¡Llegaste a la parada!',
    driver_update_failed: 'Error al actualizar',
    // Delivery proof
    proof_title: 'Prueba de Entrega',
    proof_take_photo: 'Tomar Foto',
    proof_upload_photo: 'Subir Foto',
    proof_notes: 'Notas de Entrega',
    proof_notes_placeholder: 'Cualquier nota de entrega...',
    proof_submit: 'Enviar Prueba y Completar',
    proof_photo_required: 'Por favor tome o suba una foto primero',
    proof_success: '¡Prueba de entrega enviada!',
    proof_fail: 'Error al enviar prueba',
    // Packing list
    packing_title: 'Listas de Empaque',
    packing_select_route: 'Seleccione una ruta para ver su lista de empaque',
    packing_stops: 'Paradas',
    packing_total_items: 'Total Artículos',
    packing_total_items_count: 'Artículos Totales',
    packing_loading_order: 'Orden de Carga (LIFO - Última parada se carga primero)',
    packing_stop: 'Parada',
    packing_special: 'Instrucciones Especiales',
    packing_print: 'Imprimir Lista',
    packing_driver: 'Conductor',
    packing_truck: 'Camión',
    packing_capacity: 'Capacidad',
    packing_over_capacity: '¡Sobrecapacidad!',
    // Routes
    routes_title: 'Rutas',
    routes_new: 'Nueva Ruta',
    routes_stops: 'Paradas',
    routes_miles: 'millas',
    routes_no_routes: 'No se encontraron rutas',
    route_optimize: 'Optimizar Ruta',
    route_optimizing: 'Optimizando orden de ruta...',
    route_optimized: '¡Ruta Optimizada!',
    route_saved: 'Ahorro',
    route_miles_saved: 'Millas Ahorradas',
    route_total_distance: 'Distancia Total',
    route_est_time: 'Tiempo Est.',
    route_drive: 'Conducción',
    route_fuel: 'Combustible',
    route_map: 'Mapa de Ruta',
    route_progress: 'Progreso',
    route_distance: 'Distancia',
    route_stops: 'Paradas',
    route_leg: 'Tramo',
    route_notes: 'Notas',
    route_add_note: 'Agregar nota',
    route_enter_note: 'Ingrese nota de despacho para esta parada:',
    route_note_saved: 'Nota guardada',
    route_reordered: 'Orden de paradas actualizado',
    route_add_stop: 'Agregar Parada',
    route_stop_added: 'Parada agregada a la ruta',
    route_stop_removed: 'Parada eliminada de la ruta',
    route_remove_stop: 'Eliminar Parada',
    route_view_property: 'Ver Propiedad (Satélite)',
    route_property_view: 'Vista de Propiedad',
    driver_route_map: 'Mapa General de Ruta',
    driver_next_stop: 'Próxima Parada',
    driver_go: 'IR',
    // Trucks
    trucks_title: 'Gestión de Flota',
    trucks_capacity: 'Capacidad',
    trucks_plate: 'Placa',
    // Customers
    customers_title: 'Clientes',
    customers_new: 'Nuevo Cliente',
    customers_phone: 'Teléfono',
    customers_type: 'Tipo',
    customers_orders_count: 'pedidos',
    // Products
    products_title: 'Productos',
    products_new: 'Nuevo Producto',
    products_category: 'Categoría',
    products_price: 'Precio',
    products_stock: 'Inventario',
    products_per_unit: 'por unidad',
    // Schedule
    schedule_title: 'Horario',
    // Delivery Zones
    zones_title: 'Zonas de Entrega',
    zones_new: 'Nueva Zona',
    zones_edit: 'Editar Zona',
    zones_name: 'Nombre de Zona',
    zones_color: 'Color',
    zones_delivery_days: 'Días de Entrega',
    zones_radius: 'Radio (mi)',
    zones_center: 'Punto Central',
    zones_city_pattern: 'Patrón de Ciudad',
    zones_zip_codes: 'Códigos Postales',
    zones_addresses: 'Direcciones',
    zones_draw_on_map: 'Dibujar en Mapa',
    zones_click_to_set: 'Clic en el mapa para definir centro',
    zones_no_zones: 'No hay zonas de entrega configuradas',
    zones_create_first: 'Cree zonas para organizar entregas por área y día.',
    zones_schedule: 'Horario de Zonas',
    zones_auto_assign: 'Auto-Asignar Direcciones',
    zones_assigned: 'direcciones asignadas',
    zones_boundary: 'Límite',
    zones_notes: 'Notas',
    zones_delete_confirm: '¿Eliminar esta zona? Las direcciones serán desasignadas.',
    zones_is_zone_day: 'Día de entrega de zona',
    zones_not_zone_day: 'No es día de entrega de zona',
    smart_build_title: 'Constructor Inteligente',
    smart_build_btn: 'Construir Ruta',
    smart_build_desc: 'Auto-seleccionar pedidos por zona y capacidad',
    smart_build_preview: 'Vista Previa de Ruta',
    smart_build_confirm: 'Crear Esta Ruta',
    smart_build_pallets: 'Paletas',
    smart_build_pallets: 'Pallets',
    smart_build_stops: 'Paradas',
    smart_build_miles: 'Millas Est.',
    smart_build_fuel: 'Combustible',
    smart_build_remaining: 'pedidos restantes',
    smart_build_no_orders: 'No se encontraron pedidos',
    smart_build_zone_filter: 'Filtrar por Zona',
    smart_build_all_zones: 'Todas las Zonas (auto)',
    // Common
    common_loading: 'Cargando...',
    common_error: 'Error',
    common_save: 'Guardar',
    common_cancel: 'Cancelar',
    common_delete: 'Eliminar',
    common_close: 'Cerrar',
    common_confirm: 'Confirmar',
    common_yes: 'Sí',
    common_no: 'No',
    common_search: 'Buscar...',
    common_total: 'Total',
    common_pallets: 'Paletas',
    common_lbs: 'lbs',
    common_status: 'Estado',
    common_date: 'Fecha',
    common_name: 'Nombre',
    // Priority/Status
    priority_urgent: 'urgente',
    priority_high: 'alta',
    priority_normal: 'normal',
    priority_low: 'baja',
    status_new: 'nuevo',
    status_confirmed: 'confirmado',
    status_scheduled: 'programado',
    status_loaded: 'cargado',
    status_in_transit: 'en tránsito',
    status_delivered: 'entregado',
    status_completed: 'completado',
    status_pending: 'pendiente',
    status_arrived: 'llegó',
    status_failed: 'fallido',
    // Inline creation
    inline_new_customer: 'Nuevo Cliente',
    inline_business_name: 'Nombre del Negocio',
    inline_contact_name: 'Nombre de Contacto',
    inline_phone: 'Teléfono',
    inline_email: 'Correo',
    inline_customer_type: 'Tipo',
    inline_new_product: 'Nuevo Producto',
    inline_product_name: 'Nombre del Producto',
    inline_product_sku: 'SKU',
    inline_product_category: 'Categoría',
    inline_weight_per_unit: 'Peso/Unidad (lbs)',
    inline_unit_type: 'Tipo de Unidad',
    inline_product_price: 'Precio',
    inline_add: 'Agregar',
    // OCR
    scan_title: 'Escanear Ticket de Entrega',
    scan_capture: 'Capturar Foto',
    scan_upload: 'Subir Imagen',
    scan_processing: 'Procesando ticket con OCR...',
    scan_success: '¡Ticket escaneado con éxito!',
    scan_fail: 'Error en escaneo OCR',
    // Address modal
    addr_edit_title: 'Editar Dirección',
    addr_new_title: 'Nueva Dirección',
    addr_label: 'Etiqueta',
    addr_street: 'Calle',
    addr_city: 'Ciudad',
    addr_state: 'Estado',
    addr_zip: 'Código Postal',
    addr_gate_code: 'Código de Portón',
    addr_driver_notes: 'Notas para Conductor',
    addr_primary: 'Dirección Principal',
    // Customer edit
    cust_edit_title: 'Editar Cliente',
    cust_business: 'Nombre del Negocio',
    cust_contact: 'Nombre de Contacto',
    cust_phone: 'Teléfono',
    cust_email: 'Correo',
    cust_type: 'Tipo',
    cust_notes: 'Notas',
    prod_edit: 'Editar Producto',
    prod_pallet_qty: 'Unidades/Palé',
    prod_pallet_weight: 'Peso del Palé (lbs)',
    prod_length: 'Largo (pulg)',
    prod_width: 'Ancho (pulg)',
    prod_height: 'Alto (pulg)',
    prod_stackable: 'Apilable',
    prod_max_stack: 'Máx Apilar',
    prod_dimensions: 'Dimensiones e Info de Palé',
    // (Dispatch Rules translations removed — feature replaced by AI Learning Engine)
    loading_title: 'Plan de Carga del Camión',
    loading_optimize: 'Optimizar Carga',
    loading_position: 'Posición',
    loading_instruction: 'Instrucción de Carga',
    loading_warnings: 'Advertencias',
    translate_instructions: 'Traducir',
    translate_to_spanish: 'Español',
    translate_to_creole: 'Criollo',
    translate_original: 'Original',
    orders_section_action: 'Acción Requerida',
    orders_section_scheduled: 'Programadas y En Progreso',
    orders_section_completed: 'Completadas',
    nav_drivers: 'Conductores',
    drivers_title: 'Gestión de Conductores',
    drivers_new: 'Agregar Conductor',
    drivers_preferred_lang: 'Idioma Preferido',
    drivers_role: 'Rol',
    drivers_active: 'Activo',
    nav_maintenance: 'Mantenimiento',
    maint_title: 'Mantenimiento de Flota',
    maint_new_service: 'Programar Servicio',
    maint_reminders: 'Recordatorios Próximos',
    maint_issues: 'Problemas Reportados',
    maint_records: 'Registros y Documentos',
    maint_report_issue: 'Reportar Problema',
    maint_service_type: 'Tipo de Servicio',
    maint_description: 'Descripción',
    maint_scheduled_date: 'Fecha Programada',
    maint_cost: 'Costo',
    maint_vendor: 'Proveedor',
    maint_severity: 'Severidad',
    maint_category: 'Categoría',
    maint_upload_record: 'Subir Registro',
    maint_no_records: 'Sin registros de mantenimiento.',
    maint_no_issues: 'Sin problemas reportados.',
    prod_bag_length: 'Largo Bolsa (pulg)',
    prod_bag_width: 'Ancho Bolsa (pulg)',
    prod_bag_height: 'Alto Bolsa (pulg)',
    prod_bag_dims: 'Dimensiones de Bolsa/Unidad',
    prod_auto_calc: 'Auto-calculado desde dimensiones de bolsa',
    status_on_hold: 'en espera',
    hold_title: 'Retención Temporal',
    hold_put: 'Poner en Espera',
    hold_release: 'Liberar',
    hold_reason: 'Motivo de Retención',
    hold_reason_placeholder: 'ej. Esperando confirmación del cliente...',
    hold_recurring: 'Pedido recurrente esperando confirmación',
    hold_released: 'Pedido liberado',
    hold_placed: 'Pedido en espera',
    recurring_title: 'Pedidos Recurrentes',
    recurring_new: 'Nuevo Horario Recurrente',
    recurring_edit: 'Editar Horario',
    recurring_frequency: 'Frecuencia',
    recurring_weekly: 'Semanal',
    recurring_biweekly: 'Cada 2 Semanas',
    recurring_monthly: 'Mensual',
    recurring_custom: 'Personalizado',
    recurring_interval: 'Cada X días',
    recurring_day_of_week: 'Día de la Semana',
    recurring_day_of_month: 'Día del Mes',
    recurring_next_delivery: 'Próxima Entrega',
    recurring_last_generated: 'Último Generado',
    recurring_auto_confirm: 'Auto-confirmar pedidos',
    recurring_auto_confirm_desc: 'Confirmar automáticamente los pedidos generados',
    recurring_status_active: 'Activo',
    recurring_status_paused: 'Pausado',
    recurring_status_cancelled: 'Cancelado',
    recurring_generate: 'Generar Ahora',
    recurring_skip: 'Saltar Siguiente',
    recurring_skip_reason: 'Razón para Saltar',
    recurring_skip_reason_placeholder: 'ej. Cliente de vacaciones...',
    recurring_pause: 'Pausar Horario',
    recurring_resume: 'Reanudar Horario',
    recurring_cancel: 'Cancelar Horario',
    recurring_orders_generated: 'Pedidos Generados',
    recurring_history: 'Historial de Generación',
    recurring_generated: 'Generado',
    recurring_skipped: 'Saltado',
    recurring_no_schedules: 'No hay horarios recurrentes',
    recurring_create_first: 'Configure pedidos recurrentes para clientes con entregas regulares',
    recurring_badge: 'Recurrente',
    recurring_from_schedule: 'Desde horario recurrente',
    recurring_view_schedule: 'Ver Horario',
    recurring_generate_due: 'Generar Todos Pendientes',
    recurring_generated_success: 'Pedido generado exitosamente',
    recurring_skipped_success: 'Próxima entrega saltada',
    recurring_make_recurring: 'Hacer Recurrente',
    recurring_items_template: 'Artículos (mismos productos cada entrega)',
    nav_recurring: 'Recurrentes',
    assign_trucks: 'Camiones Asignados',
    assign_add_truck: 'Asignar Camión',
    assign_primary: 'Principal',
    assign_set_primary: 'Establecer como Principal',
    assign_no_trucks: 'Sin camiones asignados',
    route_assign_driver: 'Asignar Conductor',
    route_assign_truck: 'Asignar Camión',
    route_change_driver: 'Cambiar Conductor',
    route_change_truck: 'Cambiar Camión',
    route_assigned: 'Asignado correctamente',
    route_driver_trucks_only: 'Mostrando camiones que este conductor puede operar',
    street_view: 'Vista de Calle',
    street_view_open: 'Abrir Vista de Calle',
    street_view_na: 'Vista de calle requiere coordenadas',
    archive: 'Archivar',
    archive_restore: 'Restaurar',
    archive_confirm: '¿Está seguro de archivar este elemento?',
    archive_restore_confirm: '¿Restaurar este elemento?',
    archive_success: 'Archivado exitosamente',
    archive_restore_success: 'Restaurado exitosamente',
    archive_show: 'Mostrar Archivados',
    archive_hide: 'Ocultar Archivados',
    archive_badge: 'Archivado',
    archive_empty: 'No hay elementos archivados',
    archive_section: 'Archivados',
  },
  ht: {
    // Login
    login_title: 'BF Deliver',
    login_subtitle: 'British Feed & Supplies - Jesyon Livrezon',
    login_email: 'Imèl',
    login_password: 'Modpas',
    login_email_placeholder: 'Antre imèl ou',
    login_password_placeholder: 'Antre modpas ou',
    login_submit: 'Konekte',
    login_quick: 'Koneksyon Rapid (Demo)',
    login_invalid: 'Imèl oswa modpas envalid',
    login_welcome: 'Byenveni',
    // Language
    lang_label: 'Lang',
    lang_en: 'English',
    lang_es: 'Español',
    lang_ht: 'Kreyòl',
    // Sidebar
    sidebar_subtitle: 'British Feed & Supplies',
    sidebar_driver_mode: 'Mòd Chofè',
    sidebar_signout: 'Dekonekte',
    nav_operations: 'Operasyon',
    nav_dashboard: 'Tablo',
    nav_orders: 'Kòmand',
    nav_schedule: 'Orè',
    nav_routes: 'Wout',
    nav_resources: 'Resous',
    nav_customers: 'Kliyan',
    nav_products: 'Pwodwi',
    nav_fleet: 'Flòt',
    nav_delivery: 'Livrezon',
    nav_driver_view: 'Vi Chofè',
    nav_packing_lists: 'Lis Anbalaj',
    nav_my_route: 'Wout Mwen',
    nav_todays_route: 'Wout Jodi a',
    // Dashboard
    dash_todays_orders: 'Kòmand Jodi a',
    dash_pending_orders: 'Kòmand Annatant',
    dash_in_transit: 'Nan Transpò',
    dash_urgent_orders: 'Kòmand Ijan',
    dash_completed_today: 'Fini Jodi a',
    dash_active_customers: 'Kliyan Aktif',
    dash_products: 'Pwodwi',
    dash_total_orders: 'Total Kòmand',
    dash_todays_routes: 'Wout Jodi a',
    dash_no_routes: 'Pa gen wout jodi a',
    dash_recent_orders: 'Dènye Kòmand',
    dash_view_all: 'Wè Tout',
    dash_order: 'Kòmand',
    dash_customer: 'Kliyan',
    dash_status: 'Estati',
    dash_priority: 'Priyorite',
    dash_order_status: 'Rezime Estati Kòmand',
    dash_priority_breakdown: 'Rezime Priyorite Aktif',
    dash_unassigned: 'Pa asiyen',
    dash_no_truck: 'Pa gen kamyon',
    dash_error_loading: 'Erè nan chajman tablo',
    // Orders
    orders_title: 'Kòmand',
    orders_search: 'Chèche kòmand...',
    orders_new: 'Nouvo Kòmand',
    orders_scan: 'Eskane Tikè',
    orders_date: 'Dat',
    orders_pallets: 'Palèt',
    orders_address: 'Adrès',
    orders_actions: 'Aksyon',
    orders_no_orders: 'Pa jwenn okenn kòmand',
    orders_create_first: 'Kreye premye kòmand ou pou kòmanse.',
    // Order detail
    order_details: 'Detay Kòmand',
    order_items: 'Atik nan Kòmand',
    order_ticket_image: 'Imaj Tikè',
    order_view_image: 'Wè Imaj Tikè',
    order_edit: 'Modifye',
    order_delete: 'Efase',
    order_back: 'Retounen nan Kòmand',
    order_special_instructions: 'Enstriksyon Espesyal',
    order_none: 'Okenn',
    order_created: 'Kreye',
    order_delivery_address: 'Adrès Livrezon',
    order_change_addr: 'Chanje',
    order_edit_addr: 'Modifye Adrès',
    order_new_addr: 'Nouvo Adrès',
    order_edit_customer: 'Modifye Kliyan',
    order_product: 'Pwodwi',
    order_sku: 'SKU',
    order_quantity: 'Kantite',
    order_no_items: 'Pa gen atik ankò',
    order_total_pallets: 'Palèt Est.',
    // New/Edit order form
    form_customer: 'Kliyan',
    form_select_customer: '-- Chwazi Kliyan --',
    form_add_new_customer: '+ Ajoute Nouvo Kliyan',
    form_address: 'Adrès Livrezon',
    form_select_address: '-- Chwazi Adrès --',
    form_add_new_address: '+ Ajoute Nouvo Adrès',
    form_order_number: 'N° Kòmand',
    form_order_number_placeholder: 'Soti nan tikè oswa otomatik',
    form_priority: 'Priyorite',
    form_date: 'Dat Pwograme',
    form_instructions: 'Enstriksyon Espesyal',
    form_items: 'Atik nan Kòmand',
    form_add_item: 'Ajoute Atik',
    form_select_product: '-- Chwazi Pwodwi --',
    form_add_new_product: '+ Ajoute Nouvo Pwodwi',
    form_cancel: 'Anile',
    form_save: 'Sove Chanjman',
    form_create: 'Kreye Kòmand',
    // Edit Order Modal
    edit_order_title: 'Modifye Kòmand',
    edit_order_number: 'Nimewo Kòmand',
    edit_priority: 'Priyorite',
    edit_scheduled_date: 'Dat Pwograme',
    edit_instructions: 'Enstriksyon Espesyal',
    // Driver
    driver_todays_route: 'Wout Jodi a',
    driver_stops_complete: 'Arè Fini',
    driver_delivery_stops: 'Arè Livrezon',
    driver_total_load: 'chaj total',
    driver_gate_code: 'Kòd Pòtay',
    driver_navigate: 'Navige',
    driver_arrived: 'Rive',
    driver_complete_photo: 'Fini + Foto',
    driver_delivered: 'Livre',
    driver_at: 'a',
    driver_view_proof: 'Wè Prèv',
    driver_all_complete: 'Tout Livrezon Fini!',
    driver_great_job: 'Bon travay! Retounen nan sant distribisyon an.',
    driver_navigate_base: 'Navige nan Baz',
    driver_no_route: 'Pa Gen Wout Asiyen',
    driver_no_route_msg: 'Ou pa gen wout pou jodi a. Tounen pita oswa kontakte dispatche.',
    driver_dist_center: 'Sant Distribisyon',
    driver_packing_list: 'Lis Anbalaj',
    driver_items: 'atik',
    driver_item: 'atik',
    driver_no_items: 'Pa gen atik nan kòmand sa a',
    driver_total: 'Total',
    driver_error: 'Erè nan chajman wout',
    driver_status_updated: 'Estati aktyalize',
    driver_delivery_completed: 'Livrezon fini!',
    driver_arrived_stop: 'Rive nan arè a!',
    driver_update_failed: 'Echèk nan aktyalizasyon',
    // Delivery proof
    proof_title: 'Prèv Livrezon',
    proof_take_photo: 'Pran Foto',
    proof_upload_photo: 'Telechaje Foto',
    proof_notes: 'Nòt Livrezon',
    proof_notes_placeholder: 'Nenpòt nòt livrezon...',
    proof_submit: 'Soumèt Prèv & Fini',
    proof_photo_required: 'Tanpri pran oswa telechaje yon foto anvan',
    proof_success: 'Prèv livrezon soumèt!',
    proof_fail: 'Echèk nan soumisyon prèv',
    // Packing list
    packing_title: 'Lis Anbalaj',
    packing_select_route: 'Chwazi yon wout pou wè lis anbalaj li',
    packing_stops: 'Arè',
    packing_total_items: 'Total Atik',
    packing_total_items_count: 'Atik Total',
    packing_loading_order: 'Lòd Chajman (LIFO - Dènye arè chaje anvan)',
    packing_stop: 'Arè',
    packing_special: 'Enstriksyon Espesyal',
    packing_print: 'Enprime Lis',
    packing_driver: 'Chofè',
    packing_truck: 'Kamyon',
    packing_capacity: 'Kapasite',
    packing_over_capacity: 'Depase kapasite!',
    // Routes
    routes_title: 'Wout',
    routes_new: 'Nouvo Wout',
    routes_stops: 'Arè',
    routes_miles: 'mil',
    routes_no_routes: 'Pa jwenn okenn wout',
    route_optimize: 'Optimize Wout',
    route_optimizing: 'Ap optimize lòd wout la...',
    route_optimized: 'Wout Optimize!',
    route_saved: 'Ekonomize',
    route_miles_saved: 'Mil Ekonomize',
    route_total_distance: 'Distans Total',
    route_est_time: 'Tan Estime',
    route_drive: 'Kondui',
    route_fuel: 'Gazolin',
    route_map: 'Kat Wout',
    route_progress: 'Pwogrè',
    route_distance: 'Distans',
    route_stops: 'Arè',
    route_leg: 'Etap',
    route_notes: 'Nòt',
    route_add_note: 'Ajoute nòt',
    route_enter_note: 'Antre nòt dispatè pou arè sa a:',
    route_note_saved: 'Nòt sove',
    route_reordered: 'Lòd arè mete ajou',
    route_add_stop: 'Ajoute Arè',
    route_stop_added: 'Arè ajoute nan wout la',
    route_stop_removed: 'Arè retire nan wout la',
    route_remove_stop: 'Retire Arè',
    route_view_property: 'Wè Pwopriyete (Satelit)',
    route_property_view: 'Vi Pwopriyete',
    driver_route_map: 'Kat Jeneral Wout',
    driver_next_stop: 'Pwochen Arè',
    driver_go: 'ALE',
    // Trucks
    trucks_title: 'Jesyon Flòt',
    trucks_capacity: 'Kapasite',
    trucks_plate: 'Plak',
    // Customers
    customers_title: 'Kliyan',
    customers_new: 'Nouvo Kliyan',
    customers_phone: 'Telefòn',
    customers_type: 'Tip',
    customers_orders_count: 'kòmand',
    // Products
    products_title: 'Pwodwi',
    products_new: 'Nouvo Pwodwi',
    products_category: 'Kategori',
    products_price: 'Pri',
    products_stock: 'Envantè',
    products_per_unit: 'pa inite',
    // Schedule
    schedule_title: 'Orè',
    // Delivery Zones
    zones_title: 'Zòn Livrezon',
    zones_new: 'Nouvo Zòn',
    zones_edit: 'Modifye Zòn',
    zones_name: 'Non Zòn',
    zones_color: 'Koulè',
    zones_delivery_days: 'Jou Livrezon',
    zones_radius: 'Reyon (mi)',
    zones_center: 'Pwen Santral',
    zones_city_pattern: 'Modèl Vil',
    zones_zip_codes: 'Kòd Postal',
    zones_addresses: 'Adrès',
    zones_draw_on_map: 'Desine sou Kat',
    zones_click_to_set: 'Klike sou kat la pou defini sant',
    zones_no_zones: 'Pa gen zòn livrezon konfigire',
    zones_create_first: 'Kreye zòn pou òganize livrezon pa zòn ak jou.',
    zones_schedule: 'Orè Zòn',
    zones_auto_assign: 'Oto-Asiyen Adrès',
    zones_assigned: 'adrès asiyen',
    zones_boundary: 'Limit',
    zones_notes: 'Nòt',
    zones_delete_confirm: 'Efase zòn sa a? Adrès yo ap dekonekte.',
    zones_is_zone_day: 'Jou livrezon zòn',
    zones_not_zone_day: 'Pa jou livrezon zòn',
    smart_build_title: 'Konstwiktè Wout Entèlijan',
    smart_build_btn: 'Bati Wout',
    smart_build_desc: 'Oto-chwazi kòmand pa zòn ak kapasite',
    smart_build_preview: 'Apèsi Wout',
    smart_build_confirm: 'Kreye Wout Sa a',
    smart_build_pallets: 'Palèt',
    smart_build_pallets: 'Palèt',
    smart_build_stops: 'Arè',
    smart_build_miles: 'Mil Estime',
    smart_build_fuel: 'Gazolin',
    smart_build_remaining: 'kòmand ki rete',
    smart_build_no_orders: 'Pa jwenn okenn kòmand',
    smart_build_zone_filter: 'Filtre pa Zòn',
    smart_build_all_zones: 'Tout Zòn (oto)',
    // Common
    common_loading: 'Ap chaje...',
    common_error: 'Erè',
    common_save: 'Sove',
    common_cancel: 'Anile',
    common_delete: 'Efase',
    common_close: 'Fèmen',
    common_confirm: 'Konfime',
    common_yes: 'Wi',
    common_no: 'Non',
    common_search: 'Chèche...',
    common_total: 'Total',
    common_pallets: 'Palèt',
    common_lbs: 'lbs',
    common_status: 'Estati',
    common_date: 'Dat',
    common_name: 'Non',
    // Priority/Status
    priority_urgent: 'ijan',
    priority_high: 'wo',
    priority_normal: 'nòmal',
    priority_low: 'ba',
    status_new: 'nouvo',
    status_confirmed: 'konfime',
    status_scheduled: 'pwograme',
    status_loaded: 'chaje',
    status_in_transit: 'nan transpò',
    status_delivered: 'livre',
    status_completed: 'fini',
    status_pending: 'annatant',
    status_arrived: 'rive',
    status_failed: 'echwe',
    // Inline creation
    inline_new_customer: 'Nouvo Kliyan',
    inline_business_name: 'Non Biznis',
    inline_contact_name: 'Non Kontak',
    inline_phone: 'Telefòn',
    inline_email: 'Imèl',
    inline_customer_type: 'Tip',
    inline_new_product: 'Nouvo Pwodwi',
    inline_product_name: 'Non Pwodwi',
    inline_product_sku: 'SKU',
    inline_product_category: 'Kategori',
    inline_weight_per_unit: 'Pwa/Inite (lbs)',
    inline_unit_type: 'Tip Inite',
    inline_product_price: 'Pri',
    inline_add: 'Ajoute',
    // OCR
    scan_title: 'Eskane Tikè Livrezon',
    scan_capture: 'Pran Foto',
    scan_upload: 'Telechaje Imaj',
    scan_processing: 'Ap trete tikè ak OCR...',
    scan_success: 'Tikè eskane avèk siksè!',
    scan_fail: 'Echèk nan eskanè OCR',
    // Address modal
    addr_edit_title: 'Modifye Adrès',
    addr_new_title: 'Nouvo Adrès',
    addr_label: 'Etikèt',
    addr_street: 'Ri',
    addr_city: 'Vil',
    addr_state: 'Eta',
    addr_zip: 'Kòd Postal',
    addr_gate_code: 'Kòd Pòtay',
    addr_driver_notes: 'Nòt pou Chofè',
    addr_primary: 'Adrès Prensipal',
    // Customer edit
    cust_edit_title: 'Modifye Kliyan',
    cust_business: 'Non Biznis',
    cust_contact: 'Non Kontak',
    cust_phone: 'Telefòn',
    cust_email: 'Imèl',
    cust_type: 'Tip',
    cust_notes: 'Nòt',
    prod_edit: 'Modifye Pwodui',
    prod_pallet_qty: 'Inite/Palèt',
    prod_pallet_weight: 'Pwa Palèt (lbs)',
    prod_length: 'Longè (po)',
    prod_width: 'Lajè (po)',
    prod_height: 'Wotè (po)',
    prod_stackable: 'Kapab Anpile',
    prod_max_stack: 'Maks Anpile',
    prod_dimensions: 'Dimansyon ak Enfòmasyon Palèt',
    // (Dispatch Rules translations removed — feature replaced by AI Learning Engine)
    loading_title: 'Plan Chajman Kamyon',
    loading_optimize: 'Optimize Chajman',
    loading_position: 'Pozisyon',
    loading_instruction: 'Enstriksyon Chajman',
    loading_warnings: 'Avètisman',
    translate_instructions: 'Tradui',
    translate_to_spanish: 'Panyòl',
    translate_to_creole: 'Kreyòl',
    translate_original: 'Orijinal',
    orders_section_action: 'Aksyon Obligatwa',
    orders_section_scheduled: 'Pwograme ak An Pwogrè',
    orders_section_completed: 'Konplete',
    nav_drivers: 'Chofè',
    drivers_title: 'Jesyon Chofè',
    drivers_new: 'Ajoute Chofè',
    drivers_preferred_lang: 'Lang Prefere',
    drivers_role: 'Wòl',
    drivers_active: 'Aktif',
    nav_maintenance: 'Antretyen',
    maint_title: 'Antretyen Flòt',
    maint_new_service: 'Pwograme Sèvis',
    maint_reminders: 'Rapèl ki ap vini',
    maint_issues: 'Pwoblèm Rapòte',
    maint_records: 'Dosye ak Dokiman',
    maint_report_issue: 'Rapòte Pwoblèm',
    maint_service_type: 'Tip Sèvis',
    maint_description: 'Deskripsyon',
    maint_scheduled_date: 'Dat Pwograme',
    maint_cost: 'Kouta',
    maint_vendor: 'Fournisè',
    maint_severity: 'Gravite',
    maint_category: 'Kategori',
    maint_upload_record: 'Telechaje Dosye',
    maint_no_records: 'Pa gen dosye antretyen.',
    maint_no_issues: 'Pa gen pwoblèm rapòte.',
    prod_bag_length: 'Longè Sak (po)',
    prod_bag_width: 'Lajè Sak (po)',
    prod_bag_height: 'Wotè Sak (po)',
    prod_bag_dims: 'Dimansyon Sak/Inite',
    prod_auto_calc: 'Oto-kalkile soti nan dimansyon sak',
    status_on_hold: 'an atant',
    hold_title: 'Kenbe Tanporè',
    hold_put: 'Mete an Atant',
    hold_release: 'Lage',
    hold_reason: 'Rezon pou Kenbe',
    hold_reason_placeholder: 'egz. Ap tann kliyan konfime...',
    hold_recurring: 'Kòmand regilye ap tann konfimasyon',
    hold_released: 'Kòmand lage soti nan atant',
    hold_placed: 'Kòmand mete an atant',
    recurring_title: 'Kòmand Regilye',
    recurring_new: 'Nouvo Orè Regilye',
    recurring_edit: 'Modifye Orè',
    recurring_frequency: 'Frekans',
    recurring_weekly: 'Chak Semèn',
    recurring_biweekly: 'Chak 2 Semèn',
    recurring_monthly: 'Chak Mwa',
    recurring_custom: 'Pèsonalize',
    recurring_interval: 'Chak X jou',
    recurring_day_of_week: 'Jou nan Semèn',
    recurring_day_of_month: 'Jou nan Mwa',
    recurring_next_delivery: 'Pwochen Livrezon',
    recurring_last_generated: 'Dènye Jenere',
    recurring_auto_confirm: 'Oto-konfime kòmand yo',
    recurring_auto_confirm_desc: 'Konfime otomatikman kòmand ki jenere',
    recurring_status_active: 'Aktif',
    recurring_status_paused: 'Poze',
    recurring_status_cancelled: 'Anile',
    recurring_generate: 'Jenere Kounye a',
    recurring_skip: 'Sote Pwochen',
    recurring_skip_reason: 'Rezon pou Sote',
    recurring_skip_reason_placeholder: 'egz. Kliyan an vakans...',
    recurring_pause: 'Poze Orè',
    recurring_resume: 'Reprann Orè',
    recurring_cancel: 'Anile Orè',
    recurring_orders_generated: 'Kòmand Jenere',
    recurring_history: 'Istwa Jenerasyon',
    recurring_generated: 'Jenere',
    recurring_skipped: 'Sote',
    recurring_no_schedules: 'Pa gen orè regilye ankò',
    recurring_create_first: 'Konfigure kòmand regilye pou kliyan ki gen livrezon regilye',
    recurring_badge: 'Regilye',
    recurring_from_schedule: 'Soti nan orè regilye',
    recurring_view_schedule: 'Wè Orè',
    recurring_generate_due: 'Jenere Tout ki Dwe',
    recurring_generated_success: 'Kòmand jenere avèk siksè',
    recurring_skipped_success: 'Pwochen livrezon sote',
    recurring_make_recurring: 'Fè Regilye',
    recurring_items_template: 'Atik (menm pwodwi chak livrezon)',
    nav_recurring: 'Regilye',
    assign_trucks: 'Kamyon Asiyen',
    assign_add_truck: 'Asiyen Kamyon',
    assign_primary: 'Prensipal',
    assign_set_primary: 'Mete kòm Prensipal',
    assign_no_trucks: 'Pa gen kamyon asiyen',
    route_assign_driver: 'Asiyen Chofè',
    route_assign_truck: 'Asiyen Kamyon',
    route_change_driver: 'Chanje Chofè',
    route_change_truck: 'Chanje Kamyon',
    route_assigned: 'Asiyen avèk siksè',
    route_driver_trucks_only: 'Montre kamyon chofè sa a ka kondwi',
    street_view: 'Vyou Lari',
    street_view_open: 'Ouvri Vyou Lari',
    street_view_na: 'Vyou lari bezwen kowòdone',
    archive: 'Achive',
    archive_restore: 'Restore',
    archive_confirm: 'Èske ou sèten ou vle achive eleman sa a?',
    archive_restore_confirm: 'Restore eleman sa a?',
    archive_success: 'Achive avèk siksè',
    archive_restore_success: 'Restore avèk siksè',
    archive_show: 'Montre Achive',
    archive_hide: 'Kache Achive',
    archive_badge: 'Achive',
    archive_empty: 'Pa gen eleman achive',
    archive_section: 'Achive',
  }
};

// Translation function
function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || translations.en[key] || key;
}

// Set language and re-render
function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('bf_lang', lang);
  render();
}

// Language selector HTML (compact for sidebar/login)
function langSelectorHTML(style = '') {
  const flags = { en: '🇺🇸', es: '🇪🇸', ht: '🇭🇹' };
  return `<div style="display:flex;gap:4px;align-items:center;${style}">
    ${['en','es','ht'].map(l => `<button onclick="setLanguage('${l}')" class="btn btn-sm ${currentLang===l?'btn-primary':'btn-outline'}" style="padding:4px 8px;font-size:12px;min-width:auto;gap:4px;${currentLang===l?'':'opacity:0.7'}" title="${translations[l]['lang_'+l]}">${flags[l]} ${translations[l]['lang_'+l]}</button>`).join('')}
  </div>`;
}

// Translate dynamic text (admin instructions, driver notes) for driver view
// Uses a cache to avoid re-translating the same text
var _translationCache = {};
async function translateText(text, targetLang) {
  if (!text || targetLang === 'en') return text;
  const cacheKey = `${targetLang}:${text}`;
  if (_translationCache[cacheKey]) return _translationCache[cacheKey];
  try {
    const { data } = await API.post('/translate', { text, target_lang: targetLang });
    if (data.translated) {
      _translationCache[cacheKey] = data.translated;
      return data.translated;
    }
  } catch (e) { /* fallback to original */ }
  return text;
}

// Translate all instruction elements on the page after render
async function translateDriverInstructions() {
  if (currentLang === 'en') return;
  const elements = document.querySelectorAll('[data-translate]');
  for (const el of elements) {
    const original = el.getAttribute('data-original');
    if (!original) continue;
    const translated = await translateText(original, currentLang);
    if (translated !== original) {
      el.innerHTML = translated + ` <span style="font-size:10px;opacity:0.5;margin-left:4px" title="${escapeHtml(original)}">(${currentLang === 'es' ? 'trad.' : 'trad.'})</span>`;
    }
  }
}

// ==================== AUTH ====================
function getToken() { return localStorage.getItem('bf_token'); }
function setToken(t) { localStorage.setItem('bf_token', t); }
function clearToken() { localStorage.removeItem('bf_token'); localStorage.removeItem('bf_user'); }

API.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ==================== TOAST ====================
function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas ${icons[type]}"></i><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ==================== GEO UTILS ====================
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sort orders by nearest-neighbor starting from depot (greedy TSP)
function geoSortOrders(orders, depotLat = 26.7045593, depotLng = -80.2047917) {
  const withCoords = orders.filter(o => o.lat && o.lng);
  const noCoords = orders.filter(o => !o.lat || !o.lng);
  if (withCoords.length === 0) return orders;
  const sorted = [];
  const remaining = [...withCoords];
  let curLat = depotLat, curLng = depotLng;
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(curLat, curLng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    next._geoDistance = bestDist;
    sorted.push(next);
    curLat = next.lat; curLng = next.lng;
  }
  // Add cluster labels — if gap between consecutive stops > 2mi, new cluster
  let clusterIdx = 0;
  sorted.forEach((o, i) => {
    if (i > 0 && o._geoDistance > 2) clusterIdx++;
    o._geoCluster = clusterIdx;
  });
  noCoords.forEach(o => { o._geoCluster = -1; o._geoDistance = null; });
  return [...sorted, ...noCoords];
}

var GEO_CLUSTER_COLORS = ['#059669','#2563EB','#D97706','#DC2626','#7C3AED','#0891B2','#BE185D','#4338CA','#65A30D','#EA580C'];
function geoClusterBadge(clusterIdx) {
  if (clusterIdx == null || clusterIdx < 0) return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:#F3F4F6;color:#6B7280;white-space:nowrap"><i class="fas fa-question" style="font-size:8px"></i> No GPS</span>';
  const color = GEO_CLUSTER_COLORS[clusterIdx % GEO_CLUSTER_COLORS.length];
  const letter = String.fromCharCode(65 + (clusterIdx % 26));
  return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:${color}18;color:${color};white-space:nowrap"><i class="fas fa-map-marker-alt" style="font-size:8px"></i> Area ${letter}</span>`;
}

// Render a Google Map showing orders as numbered markers
function renderPendingOrdersMap(containerId, orders, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.__gmapsLoaded) return null;
  const geocoded = orders.filter(o => o.lat && o.lng);
  if (geocoded.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);font-size:13px"><i class="fas fa-map-marked-alt"></i> No geocoded orders to display</div>';
    return null;
  }
  container.style.height = opts.height || '320px';
  container.innerHTML = '';
  const depot = window.__DEPOT || DEPOT;
  const map = new google.maps.Map(container, { center: { lat: depot.lat, lng: depot.lng }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
  // Depot marker
  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#F97316', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });
  const markers = {};
  geocoded.forEach((o, i) => {
    const color = (o._geoCluster != null && o._geoCluster >= 0) ? GEO_CLUSTER_COLORS[o._geoCluster % GEO_CLUSTER_COLORS.length] : '#1E3A5F';
    const marker = new google.maps.Marker({ position: { lat: o.lat, lng: o.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, label: { text: String(i+1), color: '#FFFFFF', fontWeight: '700', fontSize: '11px' }, title: o.order_number || o.business_name, zIndex: 100 + i });
    const iw = new google.maps.InfoWindow({ content: `<div style="font-size:12px"><strong>${o.order_number || o.business_name}</strong><br>${o.street||''}, ${o.city||''}<br>${o.item_count||0} units / ${o.pallet_count||0} pallets</div>` });
    marker.addListener('click', () => { iw.open(map, marker); if (opts.onClick) opts.onClick(o, i); });
    markers[o.id] = marker;
    bounds.extend({ lat: o.lat, lng: o.lng });
  });
  map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
  return { map, markers };
}

// ==================== UTILS ====================
function statusBadge(s) {
  const label = t('status_' + s) || s.replace('_', ' ');
  return `<span class="badge badge-${s}">${label}</span>`;
}
function priorityBadge(p) { return `<span class="badge badge-${p}"><span class="priority-dot ${p}"></span> ${p}</span>`; }

function truckReqBadge(req) {
  if (!req) return '';
  if (req === 'big') return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:#DBEAFE;color:#1D4ED8;white-space:nowrap"><i class="fas fa-truck" style="font-size:9px"></i> BIG TRUCK</span>';
  if (req === 'small') return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:#FEF3C7;color:#92400E;white-space:nowrap"><i class="fas fa-truck-pickup" style="font-size:9px"></i> SMALL TRUCK</span>';
  return '';
}

function driverRestrictionBadges(jsonStr, compact) {
  if (!jsonStr) return '';
  let restrictions;
  try { restrictions = JSON.parse(jsonStr); } catch { return ''; }
  const entries = Object.entries(restrictions);
  if (entries.length === 0) return '';
  return entries.map(([driverId, status]) => {
    const driverName = window._driversCache?.[driverId] || 'Driver #' + driverId;
    const shortName = compact ? driverName.split(' ')[0] : driverName;
    if (status === 'blocked') return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:#FEE2E2;color:#DC2626;white-space:nowrap" title="${driverName} cannot deliver here"><i class="fas fa-ban" style="font-size:8px"></i> ${shortName}</span>`;
    if (status === 'preferred') return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:#D1FAE5;color:#059669;white-space:nowrap" title="${driverName} preferred for this address"><i class="fas fa-star" style="font-size:8px"></i> ${shortName}</span>`;
    return '';
  }).filter(Boolean).join(' ');
}

async function ensureDriversCache() {
  if (window._driversCache) return;
  try {
    const { data } = await API.get('/drivers');
    window._driversCache = {};
    (data.drivers || []).forEach(d => { window._driversCache[d.id] = d.name; });
  } catch { window._driversCache = {}; }
}

function routeStatusBadge(s) {
  const map = {
    planned: { icon: 'fa-clipboard-list', color: '#6B7280', bg: '#F3F4F6', label: 'Planned' },
    pending_loading: { icon: 'fa-clock', color: '#D97706', bg: '#FEF3C7', label: 'Pending Load' },
    loaded: { icon: 'fa-boxes-stacked', color: '#2563EB', bg: '#DBEAFE', label: 'Loaded' },
    dispatched: { icon: 'fa-truck-fast', color: '#7C3AED', bg: '#EDE9FE', label: 'Dispatched' },
    in_transit: { icon: 'fa-truck-moving', color: '#7C3AED', bg: '#EDE9FE', label: 'In Transit' },
    truck_left: { icon: 'fa-truck-moving', color: '#059669', bg: '#D1FAE5', label: 'Truck Left' },
    delivered: { icon: 'fa-check-double', color: '#059669', bg: '#D1FAE5', label: 'Delivered' },
    completed: { icon: 'fa-circle-check', color: '#059669', bg: '#D1FAE5', label: 'Completed' },
  };
  const m = map[s] || { icon: 'fa-question', color: '#6B7280', bg: '#F3F4F6', label: s };
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700;background:${m.bg};color:${m.color}"><i class="fas ${m.icon}" style="font-size:10px"></i> ${m.label}</span>`;
}
function priorityIcon(p) { const m = {urgent:'🔴',high:'🟠',normal:'🟡',low:'🟢'}; return m[p]||''; }
function formatDate(d) { if(!d) return '-'; return dayjs(d).format('MMM D, YYYY'); }
function cleanHoldMarkers(text) { if (!text) return text; return text.replace(/\[HOLD_STATUS:.*?\]/g, '').replace(/\[PREV_STATUS:\w+\]/g, '').trim(); }
function formatPallets(p) { return p ? `${p} pallet${p!==1?'s':''}` : '0 pallets'; }
// Groups items by pallet_qty, sums quantities within each group, then CEILs per group.
// Mirrors backend calcPallets() so items sharing a pallet_qty share pallet space.
function calcPallets(items) {
  const groups = {};
  for (const item of items) {
    const pq = (item.pallet_qty && item.pallet_qty > 0) ? item.pallet_qty : 40;
    const qty = item.quantity || item.expected_qty || 0;
    groups[pq] = (groups[pq] || 0) + qty;
  }
  let total = 0;
  for (const pq in groups) { total += Math.ceil(groups[pq] / Number(pq)); }
  return total;
}
function statusFlow(current) {
  const steps = ['new','confirmed','scheduled','loaded','in_transit','delivered','completed'];
  const ci = steps.indexOf(current);
  if (current === 'on_hold') {
    return `<span class="status-step active" style="background:#A855F7;color:white"><i class="fas fa-pause-circle"></i> ${t('status_on_hold')}</span>`;
  }
  return steps.map((s,i) => {
    const cls = i < ci ? 'done' : i === ci ? 'active' : '';
    return `<span class="status-step ${cls}">${s.replace('_',' ')}</span>${i<steps.length-1?'<span class="status-arrow"><i class="fas fa-chevron-right"></i></span>':''}`;
  }).join('');
}

// ==================== ARCHIVE UTILITIES ====================
async function archiveItem(entity, id, isArchived) {
  const action = isArchived ? 'restore' : 'archive';
  const msg = isArchived ? t('archive_restore_confirm') : t('archive_confirm');
  if (!confirm(msg)) return false;
  try {
    await API.patch(`/archive/${entity}/${id}`, { archived: !isArchived });
    showToast(isArchived ? t('archive_restore_success') : t('archive_success'));
    return true;
  } catch (e) {
    showToast('Failed to ' + action, 'error');
    return false;
  }
}

function archiveBadge() {
  return `<span class="badge" style="background:#FEE2E2;color:#991B1B;font-size:10px;margin-left:4px"><i class="fas fa-archive"></i> ${t('archive_badge')}</span>`;
}

function archiveToggleBtn(showArchived, onClickFn) {
  return `<button onclick="${onClickFn}" class="btn ${showArchived ? 'btn-warning' : 'btn-outline'}" style="font-size:12px;padding:6px 12px;${showArchived ? 'background:#F59E0B;color:white;border-color:#F59E0B' : ''}">
    <i class="fas fa-${showArchived ? 'eye-slash' : 'archive'}"></i> ${showArchived ? t('archive_hide') : t('archive_show')}
  </button>`;
}

function archiveActionBtn(entity, id, isArchived, callbackFn) {
  if (isArchived) {
    return `<button onclick="doArchive('${entity}',${id},true,'${callbackFn}')" class="btn btn-sm" style="background:#10B981;color:white;font-size:11px;padding:4px 10px" title="${t('archive_restore')}">
      <i class="fas fa-undo"></i> ${t('archive_restore')}</button>`;
  }
  return `<button onclick="doArchive('${entity}',${id},false,'${callbackFn}')" class="btn btn-sm" style="background:#EF4444;color:white;font-size:11px;padding:4px 10px" title="${t('archive')}">
    <i class="fas fa-archive"></i> ${t('archive')}</button>`;
}

async function doArchive(entity, id, isArchived, callbackFn) {
  const ok = await archiveItem(entity, id, isArchived);
  if (ok && callbackFn && window[callbackFn]) window[callbackFn]();
}

// Track archive toggle state per page
var _archiveToggles = {};

// ==================== ROUTING ====================
function navigate(page, params = {}) {
  // Cleanup all maps before navigation to prevent stale state
  cleanupAllMaps();
  currentPage = page;
  window._params = params;
  render();
  if (window.innerWidth <= 1024) { sidebarOpen = false; updateSidebar(); }
}

function cleanupAllMaps() {
  const mapKeys = ['_zonesMap','_zoneDetailMap','_zonePickerMap','_editZoneMap','_driverMap','_routeMap','_orderMap','_scheduleMap','_gmap','_createRouteMap','_editAddrPinMap'];
  // Clean up delivery maps (Google Maps instances)
  if (window._deliveryMaps) { window._deliveryMaps = {}; }
  mapKeys.forEach(key => { if (window[key]) { window[key] = null; } });
  if (window._editZoneObserver) { try { window._editZoneObserver.disconnect(); } catch(e) {} window._editZoneObserver = null; }
  if (window._driverStopMaps) { window._driverStopMaps = null; }
  if (window._directionsPolyline) { window._directionsPolyline = null; }
  if (window._gmapInfoWindows) { window._gmapInfoWindows = []; }
  if (window._targetMarker) { window._targetMarker.setMap(null); window._targetMarker = null; }
  if (window._targetInfoWindow) { window._targetInfoWindow.close(); window._targetInfoWindow = null; }
  if (window._createRouteMapMarkers) { window._createRouteMapMarkers = []; }
  window._driverMapInit = false;
  window._routeDetailMapInit = false;
  // Remove any lingering modal overlays
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
}

function updateSidebar() {
  const sb = document.querySelector('.sidebar');
  if (sb) sb.classList.toggle('open', sidebarOpen);
}

// ==================== MAIN RENDER ====================
function render() {
  const app = document.getElementById('app');
  if (!currentUser) { renderLogin(app); return; }
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar ${sidebarOpen ? 'open' : ''}" id="sidebar">
        ${renderSidebarContent()}
      </aside>
      <div class="main-content">
        <header class="topbar">
          <div class="topbar-left">
            <button class="menu-toggle" onclick="sidebarOpen=!sidebarOpen;updateSidebar()"><i class="fas fa-bars"></i></button>
            <h2 class="topbar-title" id="pageTitle"></h2>
          </div>
          <div class="topbar-breadcrumb">${dayjs().format('dddd, MMMM D, YYYY')}</div>
        </header>
        <div class="page-content" id="pageContent"></div>
      </div>
    </div>`;
  renderPage();
}

function renderSidebarContent() {
  const items = [
    { section: t('nav_operations') },
    { id: 'dashboard', icon: 'fa-tachometer-alt', label: t('nav_dashboard') },
    { id: 'orders', icon: 'fa-clipboard-list', label: t('nav_orders') },
    { id: 'ticket_review', icon: 'fa-rectangle-list', label: 'Ticket Review', dynamicBadge: 'sqReadyCount' },
    { id: 'schedule', icon: 'fa-calendar-alt', label: t('nav_schedule') },
    { id: 'routes', icon: 'fa-route', label: t('nav_routes') },
    { id: 'route_builder', icon: 'fa-map-location-dot', label: 'Route Builder' },
    { id: 'zones', icon: 'fa-map-location-dot', label: t('zones_title') },
    { id: 'recurring', icon: 'fa-sync-alt', label: t('nav_recurring') },
    { section: t('nav_resources') },
    { id: 'customers', icon: 'fa-users', label: t('nav_customers') },
    { id: 'products', icon: 'fa-box-open', label: t('nav_products') },
    { id: 'trucks', icon: 'fa-truck', label: t('nav_fleet') },
    { id: 'drivers_mgmt', icon: 'fa-id-card', label: t('nav_drivers') || 'Drivers' },
    { id: 'maintenance', icon: 'fa-wrench', label: t('nav_maintenance') || 'Maintenance' },
    { section: t('nav_delivery') },
    { id: 'driver', icon: 'fa-steering-wheel', label: t('nav_driver_view') },
    { id: 'packing', icon: 'fa-list-check', label: t('nav_packing_lists') },
    { id: 'returns', icon: 'fa-rotate-left', label: 'Returns' },
    { section: 'Intelligence' },
    { id: 'learning', icon: 'fa-brain', label: 'AI Learning', badge: 'AI' },
    { id: 'fleet_tracking', icon: 'fa-satellite-dish', label: 'Fleet Tracking', badge: 'LIVE' },
    { id: 'fleet_sync', icon: 'fa-arrows-rotate', label: 'Fleet Sync', badge: 'SYNC' },
  ];
  if (currentUser?.role === 'driver') {
    return `
      <div class="sidebar-header">
        <div class="sidebar-logo"><i class="fas fa-truck-fast"></i><h1>${t('login_title')}</h1></div>
        <div class="sidebar-subtitle">${t('sidebar_driver_mode')}</div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">${t('nav_my_route')}</div>
        <div class="nav-item ${currentPage==='driver'?'active':''}" onclick="navigate('driver')"><i class="fas fa-route"></i> ${t('nav_todays_route')}</div>
        <div class="nav-item ${currentPage==='returns'?'active':''}" onclick="navigate('returns')"><i class="fas fa-rotate-left"></i> Returns</div>
      </nav>
      <div style="padding:12px 16px">${langSelectorHTML()}</div>
      ${renderSidebarUser()}`;
  }
  return `
    <div class="sidebar-header">
      <div class="sidebar-logo"><i class="fas fa-truck-fast"></i><h1>${t('login_title')}</h1></div>
      <div class="sidebar-subtitle">${t('sidebar_subtitle')}</div>
    </div>
    <nav class="sidebar-nav">
      ${items.map(item => item.section
        ? `<div class="nav-section">${item.section}</div>`
        : `<div class="nav-item ${currentPage===item.id?'active':''}" onclick="navigate('${item.id}')"><i class="fas ${item.icon}"></i> ${item.label}${item.badge ? ` <span style="font-size:9px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;padding:1px 5px;border-radius:8px;margin-left:4px;font-weight:700">${item.badge}</span>` : ''}${item.dynamicBadge ? `<span class="nav-badge" id="navBadge_${item.dynamicBadge}" style="display:none"></span>` : ''}</div>`
      ).join('')}
    </nav>
    <div style="padding:12px 16px">${langSelectorHTML()}</div>
    ${renderSidebarUser()}`;
}

function renderSidebarUser() {
  const initials = currentUser.name.split(' ').map(n=>n[0]).join('');
  return `<div class="sidebar-user">
    <div class="sidebar-user-info">
      <div class="sidebar-avatar">${initials}</div>
      <div><div class="sidebar-user-name">${currentUser.name}</div><div class="sidebar-user-role">${currentUser.role}</div></div>
    </div>
    <div style="margin-top:10px"><button class="btn btn-outline btn-sm" style="width:100%;justify-content:center" onclick="logout()"><i class="fas fa-sign-out-alt"></i> ${t('sidebar_signout')}</button></div>
  </div>`;
}

function renderPage() {
  const titles = { dashboard:t('nav_dashboard'), orders:t('nav_orders'), ticket_review:'Ticket Review', schedule:t('nav_schedule'), routes:t('nav_routes'), route_builder:'Route Builder', zones:t('zones_title'), recurring:t('recurring_title'), customers:t('nav_customers'), products:t('nav_products'), trucks:t('trucks_title'), drivers_mgmt:t('nav_drivers')||'Drivers', maintenance:t('nav_maintenance')||'Fleet Maintenance', driver:t('nav_driver_view'), packing:t('nav_packing_lists'), returns:'Returns', learning:'AI Learning Engine', fleet_tracking:'Fleet Tracking', fleet_sync:'Fleet Sync' };
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = titles[currentPage] || '';
  const pages = { dashboard: renderDashboard, orders: renderOrders, ticket_review: renderTicketReview, schedule: renderSchedule, routes: renderRoutes, route_builder: renderRouteBuilder, zones: renderZones, recurring: renderRecurring, customers: renderCustomers, products: renderProducts, trucks: renderTrucks, drivers_mgmt: renderDriversManagement, maintenance: renderMaintenance, driver: renderDriver, packing: renderPacking, returns: renderReturns, learning: renderLearningDashboard, fleet_tracking: renderFleetTracking, fleet_sync: renderFleetSync };
  const fn = pages[currentPage];
  if (fn) {
    const result = fn();
    if (result && result.catch) result.catch(err => {
      console.error(`Page render error (${currentPage}):`, err);
      const pc = document.getElementById('pageContent');
      if (pc) pc.innerHTML = `<div class="card" style="padding:40px;text-align:center">
        <i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i>
        <h3 style="color:var(--navy)">Page Load Error</h3>
        <p style="color:var(--gray-500);margin:8px 0 16px">${err.message || 'Something went wrong. Please try again.'}</p>
        <button class="btn btn-primary" onclick="renderPage()"><i class="fas fa-redo"></i> Retry</button>
      </div>`;
    });
  }
}

// ==================== LOGIN PAGE ====================
function renderLogin(app) {
  app.innerHTML = `
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <i class="fas fa-truck-fast"></i>
        <h1>${t('login_title')}</h1>
        <p>${t('login_subtitle')}</p>
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:16px">${langSelectorHTML()}</div>
      <form onsubmit="doLogin(event)">
        <div class="form-group">
          <label class="form-label">${t('login_email')}</label>
          <input class="form-input" type="email" id="loginEmail" placeholder="${t('login_email_placeholder')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">${t('login_password')}</label>
          <input class="form-input" type="password" id="loginPassword" placeholder="${t('login_password_placeholder')}" required>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;justify-content:center;margin-top:8px">
          <i class="fas fa-sign-in-alt"></i> ${t('login_submit')}
        </button>
      </form>
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb">
        <p style="font-size:12px;color:#9ca3af;text-align:center;margin-bottom:12px">${t('login_quick')}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="quickLogin('admin@britishfeed.com','admin123')"><i class="fas fa-crown"></i> Admin</button>
          <button class="btn btn-outline btn-sm" onclick="quickLogin('dispatch@britishfeed.com','dispatch123')"><i class="fas fa-headset"></i> Dispatch</button>
          <button class="btn btn-outline btn-sm" onclick="quickLogin('warehouse@britishfeed.com','warehouse123')"><i class="fas fa-warehouse"></i> Warehouse</button>
          <button class="btn btn-outline btn-sm" onclick="quickLogin('james@britishfeed.com','driver123')"><i class="fas fa-truck"></i> Driver</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const { data } = await API.post('/auth/login', { email, password });
    currentUser = data.user;
    setToken(data.token);
    localStorage.setItem('bf_user', JSON.stringify(data.user));
    if (currentUser.role === 'driver') currentPage = 'driver';
    else currentPage = 'dashboard';
    showToast(`${t('login_welcome')}, ${currentUser.name}!`);
    render();
  } catch (err) { showToast(t('login_invalid'), 'error'); }
}

function quickLogin(email, pw) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = pw;
  doLogin(new Event('submit'));
}

function logout() { clearToken(); currentUser = null; currentPage = 'dashboard'; render(); }

// ==================== DASHBOARD ====================
async function renderDashboard() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
    const { data } = await API.get('/dashboard/stats');
    const s = data.stats;
    pc.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-clipboard-list"></i></div><div><div class="stat-value">${s.todayOrders}</div><div class="stat-label">${t('dash_todays_orders')}</div></div></div>
        <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-clock"></i></div><div><div class="stat-value">${s.pendingOrders}</div><div class="stat-label">${t('dash_pending_orders')}</div></div></div>
        <div class="stat-card"><div class="stat-icon green"><i class="fas fa-truck-moving"></i></div><div><div class="stat-value">${s.inTransit}</div><div class="stat-label">${t('dash_in_transit')}</div></div></div>
        <div class="stat-card"><div class="stat-icon red"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-value">${s.urgentOrders}</div><div class="stat-label">${t('dash_urgent_orders')}</div></div></div>
        <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-check-circle"></i></div><div><div class="stat-value">${s.completedToday}</div><div class="stat-label">${t('dash_completed_today')}</div></div></div>
        <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-users"></i></div><div><div class="stat-value">${s.totalCustomers}</div><div class="stat-label">${t('dash_active_customers')}</div></div></div>
        <div class="stat-card"><div class="stat-icon green"><i class="fas fa-box"></i></div><div><div class="stat-value">${s.totalProducts}</div><div class="stat-label">${t('dash_products')}</div></div></div>
        <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-database"></i></div><div><div class="stat-value">${s.totalOrders}</div><div class="stat-label">${t('dash_total_orders')}</div></div></div>
      </div>
      ${(() => {
        const mapOrders = data.pendingMapOrders ? data.pendingMapOrders.filter(o=>o.lat&&o.lng) : [];
        const mapRets = data.pendingReturns ? data.pendingReturns.filter(r=>r.lat&&r.lng) : [];
        const allDashDates = [
          ...mapOrders.map(o => o.scheduled_date || o.route_date),
          ...mapRets.map(r => r.scheduled_date)
        ].filter(Boolean);
        const dashMapDates = [...new Set(allDashDates)].sort();
        const unroutedCount = mapOrders.filter(o => !o.route_id).length;
        const routedCount = mapOrders.filter(o => o.route_id).length;
        const retSuffix = mapRets.length > 0 ? ' \u00b7 ' + mapRets.length + ' return' + (mapRets.length > 1 ? 's' : '') : '';
        return (mapOrders.length > 0 || mapRets.length > 0) ? `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
            <i class="fas fa-map-marked-alt" style="color:#2563EB"></i> Delivery Map
            <span id="dashMapCount" class="badge" style="background:#DBEAFE;color:#1D4ED8;font-size:12px">${mapOrders.length} orders (${unroutedCount} unrouted, ${routedCount} on route)${retSuffix}</span>
          </h3>
          <button class="btn btn-primary btn-sm" onclick="navigate('orders')">View All Orders</button>
        </div>
        <div style="padding:10px 16px;background:#F9FAFB;border-bottom:1px solid var(--gray-200);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--gray-500)"><i class="fas fa-calendar-day"></i> Date:</span>
          <button class="btn btn-sm btn-primary" style="font-size:11px;padding:4px 10px" id="dashMapDateAll" onclick="filterDashMap('')">All Days</button>
          ${dashMapDates.map(d => {
            const isToday = d === dayjs().format('YYYY-MM-DD');
            const label = isToday ? 'Today' : formatDate(d);
            return '<button class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 10px" onclick="filterDashMap(' + "'" + d + "'" + ')">' + label + '</button>';
          }).join('')}
          <span class="map-legend" style="margin-left:auto;display:flex;gap:10px;font-size:11px;color:var(--gray-500);flex-wrap:wrap">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1E3A5F;margin-right:3px"></span>Unrouted</span>
          </span>
        </div>
        <div id="dashboardPendingMap" style="height:300px;border-radius:0 0 12px 12px"></div>
      </div>` : '';
      })()}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card">
          <div class="card-header"><h3 class="card-title"><i class="fas fa-route" style="color:var(--navy-light);margin-right:8px"></i>${t('dash_todays_routes')}</h3></div>
          <div class="card-body">
            ${data.todayRoutes.length === 0 ? `<div class="empty-state"><i class="fas fa-route"></i><h3>${t('dash_no_routes')}</h3></div>` :
              data.todayRoutes.map(r => `
                <div style="padding:12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;cursor:pointer" onclick="navigate('routes',{viewId:${r.id}})">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <div><strong>${r.route_number||'Route'}</strong> ${statusBadge(r.status)}</div>
                    <span style="font-size:13px;color:var(--gray-500)">${r.stop_count||0} stops</span>
                  </div>
                  <div style="font-size:13px;color:var(--gray-500);margin-top:4px"><i class="fas fa-user"></i> ${r.driver_name||t('dash_unassigned')} &nbsp; <i class="fas fa-truck"></i> ${r.truck_name||t('dash_no_truck')}</div>
                </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title"><i class="fas fa-clock" style="color:var(--orange);margin-right:8px"></i>${t('dash_recent_orders')}</h3>
            <button class="btn btn-primary btn-sm" onclick="navigate('orders')">${t('dash_view_all')}</button>
          </div>
          <div class="card-body" style="padding:0">
            <table><thead><tr><th>${t('dash_order')}</th><th>${t('dash_customer')}</th><th>${t('dash_status')}</th><th>${t('dash_priority')}</th></tr></thead>
            <tbody>${data.recentOrders.map(o => `
              <tr onclick="navigate('orders',{viewId:${o.id}})">
                <td><strong>${o.order_number}</strong></td>
                <td>${o.business_name}</td>
                <td>${statusBadge(o.status)}</td>
                <td>${priorityBadge(o.priority)}</td>
              </tr>`).join('')}</tbody></table>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
        <div class="card">
          <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-pie" style="color:var(--green);margin-right:8px"></i>${t('dash_order_status')}</h3></div>
          <div class="card-body">
            ${data.statusBreakdown.map(s => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
                <span>${statusBadge(s.status)}</span><strong>${s.count}</strong>
              </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title"><i class="fas fa-flag" style="color:var(--red);margin-right:8px"></i>${t('dash_priority_breakdown')}</h3></div>
          <div class="card-body">
            ${data.priorityBreakdown.map(p => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
                <span>${priorityIcon(p.priority)} ${priorityBadge(p.priority)}</span><strong>${p.count}</strong>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
    // Render dashboard delivery map (routed + unrouted + returns)
    const dashReturns = (data.pendingReturns || []).filter(r => r.lat && r.lng);
    window._dashMapReturns = dashReturns;
    if ((data.pendingMapOrders && data.pendingMapOrders.length > 0) || dashReturns.length > 0) {
      window._dashMapOrders = data.pendingMapOrders || [];
      setTimeout(() => filterDashMap(''), 100);
    }
  } catch (err) { pc.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${t('dash_error_loading')}</h3><p>${err.message}</p></div>`; }
}

function filterDashMap(dateFilter) {
  const allOrders = window._dashMapOrders || [];
  const allReturns = window._dashMapReturns || [];
  let filtered = allOrders;
  let filteredReturns = allReturns;
  if (dateFilter) {
    filtered = allOrders.filter(o => (o.scheduled_date || o.route_date) === dateFilter);
    filteredReturns = allReturns.filter(r => r.scheduled_date === dateFilter);
  }
  // Update button active states
  const mapCard = document.getElementById('dashboardPendingMap')?.closest('.card');
  if (mapCard) {
    mapCard.querySelectorAll('.btn-sm').forEach(btn => {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-outline');
    });
    const activeBtn = dateFilter
      ? [...mapCard.querySelectorAll('.btn-sm')].find(b => b.onclick?.toString().includes(`'${dateFilter}'`))
      : mapCard.querySelector('#dashMapDateAll');
    if (activeBtn) { activeBtn.classList.remove('btn-outline'); activeBtn.classList.add('btn-primary'); }
  }
  // Update count badge
  const countEl = document.getElementById('dashMapCount');
  if (countEl) {
    const unrouted = filtered.filter(o => !o.route_id).length;
    const routed = filtered.filter(o => o.route_id).length;
    const retCount = filteredReturns.length;
    countEl.textContent = `${filtered.length} orders (${unrouted} unrouted, ${routed} on route)${retCount > 0 ? ' · ' + retCount + ' return' + (retCount > 1 ? 's' : '') : ''}`;
  }
  const sorted = geoSortOrders(filtered);
  renderDeliveryMap('dashboardPendingMap', sorted, {
    height: '300px',
    onClick: (o) => navigate('orders', { viewId: o.id }),
    returns: filteredReturns
  });
}

// ==================== ORDERS PAGE ====================
async function renderOrders() {
  const pc = document.getElementById('pageContent');
  if (window._params?.viewId) { return renderOrderDetail(window._params.viewId); }
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const showArchived = _archiveToggles.orders || false;
  const [ordersRes, returnsRes] = await Promise.all([
    API.get('/orders' + (showArchived ? '?include_archived=1' : '')),
    API.get('/returns/actionable').catch(() => ({ data: { returns: [] } }))
  ]);
  const orders = ordersRes.data.orders || [];
  const pendingReturns = returnsRes.data.returns || [];
  window._ordersData = orders;
  window._pendingReturns = pendingReturns;

  // Group by status sections
  const actionStatuses = ['new','confirmed'];
  const holdStatuses = ['on_hold'];
  const progressStatuses = ['scheduled','loaded','in_transit','delivered'];
  const doneStatuses = ['completed','cancelled'];
  const active = orders.filter(o => !o.archived);
  const archived = orders.filter(o => o.archived);
  const action = geoSortOrders(active.filter(o => actionStatuses.includes(o.status)));
  const onHold = active.filter(o => holdStatuses.includes(o.status));
  const progress = active.filter(o => progressStatuses.includes(o.status));
  const done = active.filter(o => doneStatuses.includes(o.status));
  // Map orders: all active non-completed/cancelled with coords
  const mapEligible = active.filter(o => !['completed','cancelled'].includes(o.status) && o.lat && o.lng);
  // Returns with coords for map
  const mapReturns = pendingReturns.filter(r => r.lat && r.lng);
  // Collect unique dates from map-eligible orders AND returns
  const allMapDates = [
    ...mapEligible.map(o => o.scheduled_date || o.route_date),
    ...mapReturns.map(r => r.scheduled_date)
  ].filter(Boolean);
  const mapDates = [...new Set(allMapDates)].sort();
  window._ordersMapAll = mapEligible;
  window._ordersMapReturns = mapReturns;

  pc.innerHTML = `
    <div class="filters-bar no-print">
      <div class="search-bar" style="flex:1;max-width:320px"><i class="fas fa-search"></i><input class="form-input" placeholder="Search orders..." id="orderSearch" onkeyup="filterOrders()"></div>
      <select class="form-select" style="width:160px" id="orderStatusFilter" onchange="filterOrders()">
        <option value="">All Statuses</option>
        <option value="new">New</option><option value="confirmed">Confirmed</option><option value="on_hold">On Hold</option><option value="scheduled">Scheduled</option>
        <option value="loaded">Loaded</option><option value="in_transit">In Transit</option><option value="delivered">Delivered</option>
        <option value="completed">Completed</option>
      </select>
      <select class="form-select" style="width:140px" id="orderPriorityFilter" onchange="filterOrders()">
        <option value="">All Priorities</option>
        <option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
      </select>
      ${archiveToggleBtn(showArchived, "toggleArchive('orders','renderOrders')")}
      <button class="btn" style="background:linear-gradient(135deg,#F97316,#EA580C);color:white;font-weight:700" onclick="sqBatchUpload()"><i class="fas fa-layer-group"></i> Batch Scan</button>
      <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700" onclick="showBulkUpload()"><i class="fas fa-file-upload"></i> Bulk Upload</button>
      <button class="btn btn-primary" onclick="showNewOrderModal()"><i class="fas fa-plus"></i> New Order</button>
    </div>
    ${(mapEligible.length > 0 || mapReturns.length > 0) ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="cursor:pointer;user-select:none" onclick="var body=this.nextElementSibling;body.style.display=body.style.display==='none'?'':'none';this.querySelector('.section-chevron').classList.toggle('fa-chevron-down');this.querySelector('.section-chevron').classList.toggle('fa-chevron-right')">
        <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
          <i class="fas fa-map-marked-alt" style="color:#2563EB"></i> Delivery Map
          <span id="ordersMapCount" class="badge" style="background:#DBEAFE;color:#1D4ED8;font-size:12px">${mapEligible.length} orders${mapReturns.length > 0 ? ' · ' + mapReturns.length + ' return' + (mapReturns.length > 1 ? 's' : '') : ''}</span>
        </h3>
        <i class="fas fa-chevron-down section-chevron" style="color:var(--gray-400);font-size:12px"></i>
      </div>
      <div>
        <div style="padding:10px 16px;background:#F9FAFB;border-bottom:1px solid var(--gray-200);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--gray-500)"><i class="fas fa-calendar-day"></i> Date:</span>
          <button class="btn btn-sm ${''}" style="font-size:11px;padding:4px 10px" id="mapDateAll" onclick="filterOrdersMap('')">All Days</button>
          ${mapDates.map(d => {
            const isToday = d === dayjs().format('YYYY-MM-DD');
            return `<button class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 10px" onclick="filterOrdersMap('${d}')">${isToday ? 'Today' : formatDate(d)}</button>`;
          }).join('')}
          <span class="map-legend" style="margin-left:auto;display:flex;gap:10px;font-size:11px;color:var(--gray-500);flex-wrap:wrap">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1E3A5F;margin-right:3px"></span>Unrouted</span>
          </span>
        </div>
        <div id="pendingOrdersMap" style="border-radius:0 0 12px 12px"></div>
      </div>
    </div>` : ''}
    <div id="ordersGroupedView">
      ${orderSectionHTML(t('orders_section_action'), 'fa-exclamation-circle', '#DC2626', action, false)}
      ${pendingReturns.length > 0 ? returnsSectionHTML(pendingReturns) : ''}
      ${onHold.length > 0 ? orderSectionHTML(t('hold_title'), 'fa-pause-circle', '#A855F7', onHold, false) : ''}
      ${orderSectionHTML(t('orders_section_scheduled'), 'fa-clock', '#2563EB', progress, false)}
      ${orderSectionHTML(t('orders_section_completed'), 'fa-check-circle', '#059669', done, true)}
      ${showArchived && archived.length > 0 ? orderSectionHTML(t('archive_section'), 'fa-archive', '#991B1B', archived, true) : ''}
    </div>`;
  // Render the map after DOM is ready
  if (mapEligible.length > 0 || mapReturns.length > 0) {
    setTimeout(() => filterOrdersMap(''), 100);
  }
}

function filterOrdersMap(dateFilter) {
  const allOrders = window._ordersMapAll || [];
  const allReturns = window._ordersMapReturns || [];
  let filtered = allOrders;
  let filteredReturns = allReturns;
  if (dateFilter) {
    filtered = allOrders.filter(o => (o.scheduled_date || o.route_date) === dateFilter);
    filteredReturns = allReturns.filter(r => r.scheduled_date === dateFilter);
  }
  // Update button active states
  const mapCard = document.getElementById('pendingOrdersMap')?.closest('.card');
  if (mapCard) {
    mapCard.querySelectorAll('.btn-sm').forEach(btn => {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-outline');
    });
    const activeBtn = dateFilter
      ? [...mapCard.querySelectorAll('.btn-sm')].find(b => b.onclick?.toString().includes(`'${dateFilter}'`))
      : mapCard.querySelector('#mapDateAll');
    if (activeBtn) { activeBtn.classList.remove('btn-outline'); activeBtn.classList.add('btn-primary'); }
  }
  // Update count badge
  const countEl = document.getElementById('ordersMapCount');
  if (countEl) {
    const unrouted = filtered.filter(o => !o.route_id).length;
    const routed = filtered.filter(o => o.route_id).length;
    const retCount = filteredReturns.length;
    countEl.textContent = `${filtered.length} orders (${unrouted} unrouted, ${routed} on route)${retCount > 0 ? ' · ' + retCount + ' return' + (retCount > 1 ? 's' : '') : ''}`;
  }
  const sorted = geoSortOrders(filtered);
  renderDeliveryMap('pendingOrdersMap', sorted, {
    height: '380px',
    onClick: (o) => navigate('orders', { viewId: o.id }),
    returns: filteredReturns
  });
}

// Route color palette for distinct route colors on map
var ROUTE_COLORS = ['#2563EB','#059669','#D97706','#DC2626','#7C3AED','#0891B2','#BE185D','#4338CA','#65A30D','#EA580C','#0D9488','#9333EA','#CA8A04','#E11D48','#4F46E5'];
var UNROUTED_COLOR = '#1E3A5F';

function getRouteColorMap(orders) {
  const routeIds = [...new Set(orders.filter(o => o.route_id).map(o => o.route_id))];
  const colorMap = {};
  routeIds.forEach((rid, i) => { colorMap[rid] = ROUTE_COLORS[i % ROUTE_COLORS.length]; });
  return colorMap;
}

// Track delivery map instances for proper cleanup
window._deliveryMaps = window._deliveryMaps || {};

// Enhanced map: unique color per route, popups with Add to Route for unrouted
function renderDeliveryMap(containerId, orders, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.__gmapsLoaded) return null;
  // Clean up previous map
  if (window._deliveryMaps[containerId]) { window._deliveryMaps[containerId] = null; }
  container.innerHTML = '';
  const geocoded = orders.filter(o => o.lat && o.lng);
  const geoReturns = (opts.returns || []).filter(r => r.lat && r.lng);
  if (geocoded.length === 0 && geoReturns.length === 0) {
    container.style.height = opts.height || '320px';
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray-400);font-size:13px"><i class="fas fa-map-marked-alt" style="margin-right:6px"></i> No orders with coordinates for this date</div>';
    return null;
  }
  container.style.height = opts.height || '320px';
  const depot = window.__DEPOT || DEPOT;
  const map = new google.maps.Map(container, { center: { lat: depot.lat, lng: depot.lng }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
  window._deliveryMaps[containerId] = map;
  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#F97316', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });
  // Build route color map
  const routeColorMap = getRouteColorMap(geocoded);
  let unroutedIdx = 0;
  geocoded.forEach((o, i) => {
    const isRouted = !!o.route_id;
    const bgColor = isRouted ? (routeColorMap[o.route_id] || '#2563EB') : UNROUTED_COLOR;
    const borderColor = isRouted ? 'white' : 'white';
    if (!isRouted) unroutedIdx++;
    const markerLabel = isRouted ? '<i class="fas fa-truck" style="font-size:10px"></i>' : unroutedIdx;
    const _mIcon = { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: bgColor, fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 };
    // Build popup content
    const routeInfo = isRouted
      ? `<span style="color:${bgColor};font-weight:600"><i class="fas fa-route"></i> ${o.route_number || 'Routed'}</span> — ${o.status}`
      : '<span style="color:#DC2626;font-weight:600">Unrouted</span>';
    const canRemoveFromRoute = isRouted && ['new','confirmed','scheduled'].includes(o.status);
    const addToRouteBtn = !isRouted
      ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #E5E7EB"><button onclick="addOrderToRouteFromMap(${o.id}, '${(o.order_number||'').replace(/'/g,"\\'")}', '${containerId}', ${o.item_count||0}, ${o.pallet_count||0})" style="width:100%;padding:6px 10px;background:linear-gradient(135deg,#2563EB,#1D4ED8);color:white;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"><i class="fas fa-plus-circle"></i> Add to Route</button></div>`
      : `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #E5E7EB;display:flex;gap:4px">
          <button onclick="navigate('orders',{viewId:${o.id}})" style="flex:1;padding:5px 10px;background:#F3F4F6;color:#374151;border:1px solid #D1D5DB;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer"><i class="fas fa-eye"></i> View</button>
          ${canRemoveFromRoute ? `<button onclick="removeOrderFromRouteOnMap(${o.id}, '${(o.order_number||'').replace(/'/g,"\\'")}', '${containerId}')" style="flex:1;padding:5px 10px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer"><i class="fas fa-times-circle"></i> Remove</button>` : ''}
        </div>`;
    const popupContent = `<div style="min-width:180px;font-size:12px;line-height:1.5">
      <strong style="font-size:13px">${o.order_number || ''}</strong><br>
      <span style="color:#6B7280">${o.business_name || ''}</span><br>
      <span style="color:#9CA3AF;font-size:11px">${o.street||''}, ${o.city||''}</span><br>
      <span style="font-size:11px">${o.item_count||0} units / ${o.pallet_count||0} pallets</span><br>
      ${routeInfo}
      ${addToRouteBtn}
    </div>`;
    const marker = new google.maps.Marker({ position: { lat: o.lat, lng: o.lng }, map, icon: _mIcon, label: isRouted ? { text: '\uf0d1', fontFamily: 'Font Awesome 6 Free', fontWeight: '900', color: '#FFFFFF', fontSize: '10px' } : { text: String(unroutedIdx), color: '#FFFFFF', fontWeight: '700', fontSize: '11px' }, title: o.order_number || o.business_name, zIndex: 100 + i });
    const iw = new google.maps.InfoWindow({ content: popupContent, maxWidth: 250 });
    marker.addListener('click', () => { iw.open(map, marker); });
    bounds.extend({ lat: o.lat, lng: o.lng });
  });
  // Render return markers
  const returns = (opts.returns || []).filter(r => r.lat && r.lng);
  returns.forEach((r) => {
    const isOnRoute = !!r.route_id;
    const _retColor = isOnRoute ? '#7C3AED' : '#EA580C';
    const totalUnits = r.total_units || r.items?.reduce((s, i) => s + (i.expected_qty || 0), 0) || 0;
    const routeInfo = isOnRoute
      ? `<span style="color:#7C3AED;font-weight:600"><i class="fas fa-route"></i> On Route</span>`
      : '<span style="color:#EA580C;font-weight:600">Pending Pickup</span>';
    const addBtn = !isOnRoute
      ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #E5E7EB"><button onclick="addReturnToRouteFromMap(${r.id}, '${(r.business_name||'').replace(/'/g,"\\'")}', '${containerId}')" style="width:100%;padding:6px 10px;background:linear-gradient(135deg,#EA580C,#C2410C);color:white;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"><i class="fas fa-plus-circle"></i> Add to Route</button></div>`
      : `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #E5E7EB"><button onclick="removeReturnFromRouteOnMap(${r.id}, '${(r.business_name||'').replace(/'/g,"\\'")}', '${containerId}')" style="width:100%;padding:5px 10px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"><i class="fas fa-times-circle"></i> Remove from Route</button></div>`;
    const popupContent = `<div style="min-width:180px;font-size:12px;line-height:1.5">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px"><span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px"><i class="fas fa-rotate-left"></i> RETURN</span></div>
      <strong style="font-size:13px">${r.order_number || 'Return #'+r.id}</strong><br>
      <span style="color:#6B7280">${r.business_name || ''}</span><br>
      <span style="color:#9CA3AF;font-size:11px">${r.street||''}, ${r.city||''}</span><br>
      <span style="font-size:11px">${totalUnits} units to pick up</span><br>
      ${r.notes ? `<span style="font-size:11px;color:#6B7280"><i class="fas fa-comment"></i> ${r.notes}</span><br>` : ''}
      ${routeInfo}
      ${addBtn}
    </div>`;
    const marker = new google.maps.Marker({ position: { lat: r.lat, lng: r.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: _retColor, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, label: { text: '\uf2ea', fontFamily: 'Font Awesome 6 Free', fontWeight: '900', color: '#FFFFFF', fontSize: '10px' }, title: 'Return: ' + (r.business_name || 'Return #'+r.id), zIndex: 200 });
    const retIw = new google.maps.InfoWindow({ content: popupContent, maxWidth: 250 });
    marker.addListener('click', () => { retIw.open(map, marker); });
    bounds.extend({ lat: r.lat, lng: r.lng });
  });
  map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
  // Update the legend area if present
  updateMapLegend(containerId, geocoded, routeColorMap, returns);
  return { map };
}

// Update legend to show per-route colors + returns
function updateMapLegend(containerId, orders, routeColorMap, returns) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const legendEl = container.closest('.card')?.querySelector('.map-legend');
  if (!legendEl) return;
  const unroutedCount = orders.filter(o => !o.route_id).length;
  let html = `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${UNROUTED_COLOR};margin-right:3px"></span>Unrouted (${unroutedCount})</span>`;
  // Group routes
  const routeGroups = {};
  orders.filter(o => o.route_id).forEach(o => {
    if (!routeGroups[o.route_id]) routeGroups[o.route_id] = { name: o.route_number || 'Route', count: 0 };
    routeGroups[o.route_id].count++;
  });
  Object.entries(routeGroups).forEach(([rid, info]) => {
    const color = routeColorMap[rid] || '#2563EB';
    html += `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:3px"></span>${info.name} (${info.count})</span>`;
  });
  // Returns legend
  const rets = returns || [];
  if (rets.length > 0) {
    html += `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;transform:rotate(45deg);background:#EA580C;margin-right:5px"></span>Returns (${rets.length})</span>`;
  }
  legendEl.innerHTML = html;
}

// Add order to route from map popup
async function addOrderToRouteFromMap(orderId, orderNumber, mapContainerId, orderUnits, orderPallets) {
  // Close open info windows (no-op for Google Maps, handled per-window)
  // Fetch active routes
  let routes = [];
  try {
    const { data } = await API.get('/routes');
    routes = (data.routes || []).filter(r => !['completed','cancelled'].includes(r.status));
  } catch (e) { showToast('Failed to load routes', 'error'); return; }
  if (routes.length === 0) {
    showToast('No active routes available. Create a route first.', 'error');
    return;
  }
  const oUnits = orderUnits || 0;
  const oPallets = orderPallets || 0;
  // Show route picker modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:480px">
    <div class="modal-header">
      <h3 class="modal-title"><i class="fas fa-plus-circle" style="color:var(--navy-light);margin-right:8px"></i>Add to Route</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body" style="padding:16px">
      <div style="margin-bottom:12px;padding:10px 14px;background:#F0F9FF;border-radius:8px;border-left:3px solid #2563EB;display:flex;justify-content:space-between;align-items:center">
        <strong style="color:#1E3A5F">${orderNumber}</strong>
        <span style="font-size:12px;color:var(--gray-500)"><i class="fas fa-box" style="margin-right:3px"></i>${oUnits} units · <i class="fas fa-pallet" style="margin-right:3px"></i>${oPallets} pallets</span>
      </div>
      <label style="font-size:13px;font-weight:600;color:var(--gray-600);margin-bottom:6px;display:block">Select Route:</label>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:350px;overflow-y:auto">
        ${routes.map(r => {
          const dateStr = r.date ? formatDate(r.date) : 'No date';
          const curUnits = r.total_items || 0;
          const curPallets = r.total_pallets || 0;
          const newUnits = curUnits + oUnits;
          const newPallets = curPallets + oPallets;
          // Small trucks (bale) use unit capacity, big trucks (pallet) use pallet capacity
          const isSmallTruck = r.truck_type === 'bale';
          const maxCap = isSmallTruck ? (r.bale_capacity || 0) : (r.max_pallet_spots || 0);
          const curLoad = isSmallTruck ? curUnits : curPallets;
          const newLoad = isSmallTruck ? newUnits : newPallets;
          const capLabel = isSmallTruck ? 'units' : 'pallets';
          const overCapacity = maxCap > 0 && newLoad > maxCap;
          const truckTypeBadge = r.truck_type
            ? (isSmallTruck
              ? '<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:#FEF3C7;color:#92400E;margin-left:4px"><i class="fas fa-truck-pickup" style="font-size:8px"></i> SM</span>'
              : '<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:#DBEAFE;color:#1D4ED8;margin-left:4px"><i class="fas fa-truck" style="font-size:8px"></i> BIG</span>')
            : '';
          const capacityBar = maxCap > 0
            ? `<div style="margin-top:4px;display:flex;align-items:center;gap:6px">
                <div style="flex:1;height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(100, Math.round(newLoad/maxCap*100))}%;background:${overCapacity ? '#DC2626' : newLoad/maxCap > 0.8 ? '#D97706' : '#059669'};border-radius:3px;transition:width 0.3s"></div>
                </div>
                <span style="font-size:10px;font-weight:600;color:${overCapacity ? '#DC2626' : '#6B7280'};white-space:nowrap">${newLoad}/${maxCap} ${capLabel}</span>
              </div>`
            : '';
          // Show the capacity-relevant metric prominently, and the other as secondary
          const primaryIcon = isSmallTruck ? 'fa-box' : 'fa-pallet';
          const primaryLabel = isSmallTruck ? 'units' : 'pallets';
          const primaryCur = isSmallTruck ? curUnits : curPallets;
          const primaryNew = isSmallTruck ? newUnits : newPallets;
          const secondaryIcon = isSmallTruck ? 'fa-pallet' : 'fa-box';
          const secondaryLabel = isSmallTruck ? 'pallets' : 'units';
          const secondaryCur = isSmallTruck ? curPallets : curUnits;
          const secondaryNew = isSmallTruck ? newPallets : newUnits;
          return `<button onclick="confirmAddToRoute(${orderId}, ${r.id}, '${orderNumber.replace(/'/g,"\\'")}', '${(r.route_number||'Route').replace(/'/g,"\\'")}', '${mapContainerId}')" style="text-align:left;padding:12px;border:1px solid ${overCapacity ? '#FECACA' : 'var(--gray-200)'};border-radius:8px;background:${overCapacity ? '#FFF5F5' : 'white'};cursor:pointer;display:flex;align-items:center;gap:10px;transition:all 0.15s" onmouseover="this.style.borderColor='#2563EB'" onmouseout="this.style.borderColor='${overCapacity ? '#FECACA' : 'var(--gray-200)'}'" >
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#2563EB,#1D4ED8);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:800;flex-shrink:0"><i class="fas fa-route"></i></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;color:var(--navy);font-size:13px">${r.route_number || 'Route #'+r.id}${truckTypeBadge}</div>
              <div style="font-size:11px;color:var(--gray-500)">${dateStr} · ${r.driver_name||'No driver'} · ${r.stop_count||0} stops</div>
              <div style="display:flex;gap:12px;margin-top:3px;font-size:11px">
                <span style="color:var(--gray-500)"><i class="fas ${primaryIcon}" style="font-size:9px;margin-right:2px"></i> ${primaryCur} <i class="fas fa-arrow-right" style="font-size:8px;margin:0 2px;color:var(--gray-400)"></i> <strong style="color:${overCapacity ? '#DC2626' : 'var(--navy)'}">${primaryNew}</strong> ${primaryLabel}${overCapacity ? ' <span style="color:#DC2626;font-size:10px;font-weight:700">OVER</span>' : ''}</span>
                <span style="color:var(--gray-400)"><i class="fas ${secondaryIcon}" style="font-size:9px;margin-right:2px"></i> ${secondaryCur} → ${secondaryNew} ${secondaryLabel}</span>
              </div>
              ${capacityBar}
            </div>
            <i class="fas fa-chevron-right" style="color:var(--gray-400);font-size:12px"></i>
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function confirmAddToRoute(orderId, routeId, orderNumber, routeNumber, mapContainerId) {
  // Close the route picker modal
  document.querySelector('.modal-overlay')?.remove();
  try {
    await API.post('/routes/' + routeId + '/stops', { order_id: orderId });
    showToast(orderNumber + ' added to ' + routeNumber + '!');
    // Refresh the page/map
    if (window._params?.page === 'orders' || document.getElementById('ordersGroupedView')) {
      renderOrders();
    } else {
      renderDashboard();
    }
  } catch (err) {
    showToast('Failed to add: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// Add return to route from map popup
async function addReturnToRouteFromMap(returnId, businessName, mapContainerId) {
  // Info windows auto-close
  let routes = [];
  try {
    const { data } = await API.get('/routes');
    routes = (data.routes || []).filter(r => !['completed','cancelled'].includes(r.status));
  } catch (e) { showToast('Failed to load routes', 'error'); return; }
  if (routes.length === 0) {
    showToast('No active routes available. Create a route first.', 'error');
    return;
  }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:480px">
    <div class="modal-header">
      <h3 class="modal-title"><i class="fas fa-rotate-left" style="color:#EA580C;margin-right:8px"></i>Add Return to Route</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body" style="padding:16px">
      <div style="margin-bottom:12px;padding:10px 14px;background:#FFF7ED;border-radius:8px;border-left:3px solid #EA580C;display:flex;justify-content:space-between;align-items:center">
        <div><span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-right:6px"><i class="fas fa-rotate-left"></i> RETURN</span><strong style="color:#1E3A5F">${businessName}</strong></div>
      </div>
      <label style="font-size:13px;font-weight:600;color:var(--gray-600);margin-bottom:6px;display:block">Select Route:</label>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:350px;overflow-y:auto">
        ${routes.map(r => {
          const dateStr = r.date ? formatDate(r.date) : 'No date';
          return `<button onclick="confirmAddReturnToRoute(${returnId}, ${r.id}, '${businessName.replace(/'/g,"\\'")}', '${(r.route_number||'Route').replace(/'/g,"\\'")}', '${mapContainerId}')" style="text-align:left;padding:12px;border:1px solid var(--gray-200);border-radius:8px;background:white;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all 0.15s" onmouseover="this.style.background='#FFF7ED';this.style.borderColor='#EA580C'" onmouseout="this.style.background='white';this.style.borderColor='var(--gray-200)'">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#EA580C,#C2410C);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:800;flex-shrink:0"><i class="fas fa-route"></i></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;color:var(--navy);font-size:13px">${r.route_number || 'Route #'+r.id}</div>
              <div style="font-size:11px;color:var(--gray-500)">${dateStr} · ${r.driver_name||'No driver'} · ${r.stop_count||0} stops</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--gray-400);font-size:12px"></i>
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function confirmAddReturnToRoute(returnId, routeId, businessName, routeNumber, mapContainerId) {
  document.querySelector('.modal-overlay')?.remove();
  try {
    await API.post('/routes/' + routeId + '/return-stops', { return_id: returnId });
    showToast('Return for ' + businessName + ' added to ' + routeNumber + '!');
    if (window._params?.page === 'orders' || document.getElementById('ordersGroupedView')) {
      renderOrders();
    } else {
      renderDashboard();
    }
  } catch (err) {
    showToast('Failed to add: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// Remove order from its route via map popup
async function removeOrderFromRouteOnMap(orderId, orderNumber, mapContainerId) {
  // Info windows auto-close
  if (!confirm(`Remove ${orderNumber} from its route? It will be unrouted and available to add to another route.`)) return;
  try {
    await API.delete('/orders/' + orderId + '/route');
    showToast(orderNumber + ' removed from route — now unrouted');
    if (window._params?.page === 'orders' || document.getElementById('ordersGroupedView')) {
      renderOrders();
    } else {
      renderDashboard();
    }
  } catch (err) {
    showToast('Failed to remove: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// Remove return from its route via map popup
async function removeReturnFromRouteOnMap(returnId, businessName, mapContainerId) {
  // Info windows auto-close
  if (!confirm(`Remove return for ${businessName} from its route?`)) return;
  try {
    await API.delete('/returns/' + returnId + '/route');
    showToast('Return for ' + businessName + ' removed from route');
    if (window._params?.page === 'orders' || document.getElementById('ordersGroupedView')) {
      renderOrders();
    } else {
      renderDashboard();
    }
  } catch (err) {
    showToast('Failed to remove: ' + (err.response?.data?.error || err.message), 'error');
  }
}

function toggleArchive(page, callbackFn) {
  _archiveToggles[page] = !_archiveToggles[page];
  if (window[callbackFn]) window[callbackFn]();
}

function orderSectionHTML(title, icon, color, items, collapsed) {
  return `<div class="card" style="margin-bottom:16px">
    <div class="card-header" style="cursor:pointer;user-select:none" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.section-chevron').classList.toggle('fa-chevron-down');this.querySelector('.section-chevron').classList.toggle('fa-chevron-right')">
      <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
        <i class="fas ${icon}" style="color:${color}"></i> ${title}
        <span class="badge" style="background:${color}20;color:${color};font-size:12px">${items.length}</span>
      </h3>
      <i class="fas ${collapsed?'fa-chevron-right':'fa-chevron-down'} section-chevron" style="color:var(--gray-400);font-size:12px"></i>
    </div>
    <div class="table-container" style="${collapsed?'display:none':''}">
      ${items.length === 0 ? '<div style="text-align:center;padding:16px;color:var(--gray-400)">No orders in this section</div>' : `
      <table><thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Date</th><th>Priority</th><th>Status</th><th></th></tr></thead>
      <tbody>${items.map(o => orderRow(o)).join('')}</tbody></table>`}
    </div>
  </div>`;
}

function orderRow(o) {
  const recurBadge = o.recurring_schedule_id ? `<span class="badge" style="background:#EDE9FE;color:#7C3AED;font-size:10px;margin-left:4px" title="${t('recurring_badge')}"><i class="fas fa-sync-alt"></i></span>` : '';
  const archBadge = o.archived ? archiveBadge() : '';
  const routeBadge = o.route_id ? `<span class="badge" style="background:#DBEAFE;color:#1D4ED8;font-size:10px;margin-left:4px" title="Route: ${o.route_number || 'Assigned'}"><i class="fas fa-route"></i> ${o.route_number || 'Routed'}</span>` : '';
  const returnBadge = o.return_count > 0 ? `<span class="badge" style="background:#FEE2E2;color:#DC2626;font-size:10px;margin-left:4px" title="Has ${o.return_count} return(s) — ${o.return_status}"><i class="fas fa-rotate-left"></i> ${o.return_count} return${o.return_count>1?'s':''}</span>` : '';
  const truckBadge = truckReqBadge(o.truck_requirement);
  return `<tr onclick="navigate('orders',{viewId:${o.id}})" style="${o.route_id ? 'background:#F0F9FF;' : ''}">
    <td><strong style="color:var(--navy)">${o.order_number}</strong>${recurBadge}${archBadge}${routeBadge}${returnBadge}${truckBadge ? ' '+truckBadge : ''}</td>
    <td>${o.business_name}</td>
    <td style="font-size:12px;color:var(--gray-500)">${o.street||''} ${o.city||''}</td>
    <td>${formatDate(o.scheduled_date)}</td>
    <td>${priorityBadge(o.priority)}</td>
    <td>${statusBadge(o.status)}</td>
    <td><i class="fas fa-chevron-right" style="color:var(--gray-400)"></i></td>
  </tr>`;
}

function returnsSectionHTML(returns) {
  const today = dayjs().format('YYYY-MM-DD');
  return `<div class="card" style="margin-bottom:16px">
    <div class="card-header" style="cursor:pointer;user-select:none;background:linear-gradient(135deg,#FAF5FF,#F3E8FF)" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.section-chevron').classList.toggle('fa-chevron-down');this.querySelector('.section-chevron').classList.toggle('fa-chevron-right')">
      <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
        <i class="fas fa-rotate-left" style="color:#7C3AED"></i> Returns Pending Pickup
        <span class="badge" style="background:#EDE9FE;color:#7C3AED;font-size:12px">${returns.length}</span>
      </h3>
      <i class="fas fa-chevron-down section-chevron" style="color:var(--gray-400);font-size:12px"></i>
    </div>
    <div>
      ${returns.map(r => {
        const itemSummary = (r.items||[]).map(it => `${it.expected_qty}x ${it.product_name}`).join(', ');
        const totalQty = (r.items||[]).reduce((s,i) => s + (i.expected_qty||0), 0);
        return `<div style="padding:12px 16px;border-bottom:1px solid var(--gray-100);display:flex;align-items:flex-start;gap:12px">
          <div style="min-width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">
            <i class="fas fa-rotate-left"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <div>
                <strong style="font-size:14px;color:var(--navy)">${r.business_name}</strong>
                ${r.order_number ? `<span style="font-size:11px;color:var(--gray-400);margin-left:6px">from ${r.order_number}</span>` : ''}
                <span class="badge" style="background:#EDE9FE;color:#7C3AED;font-size:10px;margin-left:4px">${r.status}</span>
                ${r.route_id ? `<span class="badge" style="background:#DBEAFE;color:#1D4ED8;font-size:10px;margin-left:4px"><i class="fas fa-route"></i> On Route</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap">
                ${!r.route_id ? `<input type="date" id="retDate_${r.id}" value="${r.scheduled_date||''}" min="${today}"
                  style="font-size:12px;padding:4px 8px;border:1px solid var(--gray-200);border-radius:6px;color:var(--navy)" 
                  onchange="scheduleReturn(${r.id}, this.value)">
                <button class="btn btn-sm" style="background:#7C3AED;color:white;font-weight:700;font-size:11px;padding:4px 10px" onclick="scheduleReturn(${r.id}, document.getElementById('retDate_${r.id}').value)">
                  <i class="fas fa-calendar-check"></i> Schedule
                </button>
                <button class="btn btn-sm" style="background:#1D4ED8;color:white;font-weight:700;font-size:11px;padding:4px 10px" onclick="showAddReturnToRouteModal(${r.id}, '${escapeHtml(r.business_name)}')">
                  <i class="fas fa-route"></i> Add to Route
                </button>` : `<span style="font-size:11px;color:#059669;font-weight:700"><i class="fas fa-check-circle"></i> Routed</span>`}
              </div>
            </div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:4px">
              <i class="fas fa-map-marker-alt" style="color:var(--gray-400)"></i> ${r.street||'No address'} ${r.city||''}
            </div>
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${(r.items||[]).map(it => `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:3px 8px;background:#F9FAFB;border:1px solid var(--gray-200);border-radius:4px;font-weight:600">
                <strong style="color:#7C3AED">${it.expected_qty}</strong>x ${it.product_name} ${it.reason?`<span style="color:var(--gray-400)">· ${it.reason.replace(/_/g,' ')}</span>`:''}
              </span>`).join('')}
            </div>
            ${r.scheduled_date ? `<div style="margin-top:4px;font-size:11px;color:#059669;font-weight:700"><i class="fas fa-calendar-check"></i> Scheduled: ${formatDate(r.scheduled_date)}</div>` : ''}
            ${r.notes ? `<div style="margin-top:4px;font-size:11px;color:var(--gray-500)"><i class="fas fa-sticky-note" style="color:var(--orange)"></i> ${escapeHtml(r.notes)}</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

async function scheduleReturn(returnId, date) {
  if (!date) { showToast('Pick a date first', 'error'); return; }
  try {
    await API.put(`/returns/${returnId}`, { scheduled_date: date });
    showToast(`Return #${returnId} scheduled for ${formatDate(date)}`);
    // Refresh the date indicator inline
    const el = document.getElementById(`retDate_${returnId}`);
    if (el) el.value = date;
    // Refresh returns data
    const { data } = await API.get('/returns/actionable');
    window._pendingReturns = data.returns || [];
    filterOrders();
  } catch (err) { showToast('Failed to schedule return', 'error'); }
}

async function showAddReturnToRouteModal(returnId, businessName) {
  const { data } = await API.get('/routes?include_archived=0');
  const routes = (data.routes || []).filter(r => r.status !== 'completed');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-route" style="color:#1D4ED8"></i> Add Return to Route</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px">Adding return pickup for <strong>${businessName}</strong></p>
      ${routes.length === 0 ? `<div class="empty-state" style="padding:20px"><p>No active routes available</p></div>` :
      `<div style="max-height:350px;overflow-y:auto">${routes.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--gray-100);cursor:pointer;border-radius:8px" class="hover-row"
          onclick="confirmAddReturnToRoute(${returnId},${r.id},'${escapeHtml(businessName)}','${escapeHtml(r.route_number||'Route #'+r.id)}')">
          <div style="flex:1">
            <strong style="color:var(--navy)">${r.route_number||'Route #'+r.id}</strong>
            <span style="font-size:12px;color:var(--gray-400);margin-left:6px">${formatDate(r.date)}</span>
            <div style="font-size:12px;color:var(--gray-500)">${r.truck_name||'No truck'} · ${r.driver_name||'No driver'} · ${r.stop_count||0} stops</div>
          </div>
          ${routeStatusBadge(r.status)}
        </div>`).join('')}</div>`}
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function filterOrders() {
  const search = document.getElementById('orderSearch')?.value || '';
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const priority = document.getElementById('orderPriorityFilter')?.value || '';
  const showArchived = _archiveToggles.orders || false;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (showArchived) params.set('include_archived', '1');
  const { data } = await API.get(`/orders?${params}`);
  const orders = data.orders || [];
  window._ordersData = orders;

  const active = orders.filter(o => !o.archived);
  const archived = orders.filter(o => o.archived);
  const today = dayjs().format('YYYY-MM-DD');
  const isPast = (o) => o.scheduled_date && o.scheduled_date < today && !o.route_id;
  const action = active.filter(o => ['new','confirmed'].includes(o.status) && !isPast(o));
  const pastDue = active.filter(o => ['new','confirmed'].includes(o.status) && isPast(o));
  const onHold = active.filter(o => o.status === 'on_hold');
  const progress = active.filter(o => ['scheduled','loaded','in_transit','delivered'].includes(o.status));
  const done = active.filter(o => ['completed','cancelled'].includes(o.status));

  const pendingReturns = window._pendingReturns || [];
  document.getElementById('ordersGroupedView').innerHTML = `
    ${orderSectionHTML(t('orders_section_action'), 'fa-exclamation-circle', '#DC2626', action, false)}
    ${pendingReturns.length > 0 ? returnsSectionHTML(pendingReturns) : ''}
    ${onHold.length > 0 ? orderSectionHTML(t('hold_title'), 'fa-pause-circle', '#A855F7', onHold, false) : ''}
    ${orderSectionHTML(t('orders_section_scheduled'), 'fa-clock', '#2563EB', progress, false)}
    ${pastDue.length > 0 ? orderSectionHTML('In the Past', 'fa-calendar-xmark', '#92400E', pastDue, false) : ''}
    ${orderSectionHTML(t('orders_section_completed'), 'fa-check-circle', '#059669', done, true)}
    ${showArchived && archived.length > 0 ? orderSectionHTML(t('archive_section'), 'fa-archive', '#991B1B', archived, true) : ''}`;
}

async function renderOrderDetail(id) {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const [{ data }] = await Promise.all([API.get(`/orders/${id}`), ensureDriversCache()]);
  const o = data.order; const items = data.items;
  pc.innerHTML = `
    <div class="no-print" style="margin-bottom:16px"><button class="btn btn-outline" onclick="navigate('orders')"><i class="fas fa-arrow-left"></i> Back to Orders</button></div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div><h3 class="card-title" style="font-size:20px">${o.order_number}</h3><span style="color:var(--gray-500);font-size:13px">${o.business_name}</span></div>
        <div style="display:flex;gap:8px">
          ${priorityBadge(o.priority)} ${statusBadge(o.status)}
        </div>
      </div>
      <div class="card-body">
        <div style="margin-bottom:16px">${statusFlow(o.status)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
          <div>
            <div class="form-label" style="display:flex;justify-content:space-between;align-items:center">Customer
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="showEditCustomerModal(${o.customer_id}, ${o.id})"><i class="fas fa-pen"></i> Edit</button>
            </div>
            <div><strong>${o.business_name}</strong></div>
            <div style="font-size:13px;color:var(--gray-500)">${o.contact_name||''} ${o.customer_phone?'• '+o.customer_phone:''}</div>
            ${o.customer_email?`<div style="font-size:12px;color:var(--gray-400)">${o.customer_email}</div>`:''}
          </div>
          <div>
            <div class="form-label" style="display:flex;justify-content:space-between;align-items:center">Delivery Address
              <span style="display:flex;gap:4px">
                ${o.address_id?`<button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="showEditAddressModal(${o.address_id}, ${o.id})"><i class="fas fa-pen"></i></button>`:''}
                <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="showNewAddressModal(${o.customer_id}, ${o.id})"><i class="fas fa-plus"></i> New</button>
                <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="showChangeAddressModal(${o.customer_id}, ${o.id})"><i class="fas fa-exchange-alt"></i></button>
              </span>
            </div>
            <div>${o.street||'No address set'} ${o.street ? ', '+( o.city||'')+' '+(o.state||'')+' '+(o.zip||'') : ''}</div>
            ${(!o.lat || !o.lng) && o.address_id ? `<div style="margin-top:6px;padding:6px 10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;font-size:12px;color:#DC2626;display:flex;align-items:center;gap:8px">
              <i class="fas fa-exclamation-triangle"></i> <span style="flex:1">No GPS coordinates — won't show on map</span>
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px;color:#DC2626;border-color:#DC2626" onclick="retryGeocode(${o.address_id},${o.id})"><i class="fas fa-sync"></i> Retry</button>
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px;color:#2563EB;border-color:#2563EB" onclick="showPinDropModal(${o.address_id},${o.id})"><i class="fas fa-map-pin"></i> Place Pin</button>
            </div>` : ''}
            ${o.gate_code?`<div style="font-size:12px;color:var(--orange);margin-top:2px"><i class="fas fa-key"></i> Gate: ${o.gate_code}</div>`:''}
            ${o.address_notes?`<div style="font-size:12px;color:var(--gray-500);margin-top:2px"><i class="fas fa-sticky-note"></i> ${o.address_notes}</div>`:''}
            ${o.truck_requirement || o.driver_restrictions ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px" id="orderDeliveryReqs">${truckReqBadge(o.truck_requirement)} ${driverRestrictionBadges(o.driver_restrictions, false)}</div>` : ''}
          </div>
          <div>
            <div class="form-label">Scheduled Date</div>
            <div>${formatDate(o.scheduled_date)}</div>

          </div>
        </div>
        ${o.route_id?`<div style="margin-top:16px;padding:12px;background:#EFF6FF;border-radius:8px;border-left:3px solid #2563EB">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:12px;color:#1D4ED8"><i class="fas fa-route"></i> Assigned to Route</strong>
            <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px;color:#1D4ED8;border-color:#1D4ED8" onclick="navigate('routes',{viewId:${o.route_id}})"><i class="fas fa-eye"></i> View Route</button>
          </div>
          <div style="margin-top:6px;font-size:13px;color:#1E40AF">${o.route_number || 'Route'} &bull; ${formatDate(o.route_date)} &bull; ${routeStatusBadge(o.route_status)}</div>
        </div>`:''}
        ${o.status==='on_hold'?`<div style="margin-top:16px;padding:12px;background:#FDF4FF;border-radius:8px;border-left:3px solid #A855F7">
          <strong style="font-size:12px;color:#A855F7"><i class="fas fa-pause-circle"></i> ${t('hold_title')}</strong>
          <div style="margin-top:4px;font-size:14px;color:#7C3AED">${t('hold_recurring')}</div>
        </div>`:''}
        ${o.recurring_schedule_id?`<div style="margin-top:16px;padding:12px;background:#EDE9FE;border-radius:8px;border-left:3px solid #7C3AED">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:12px;color:#7C3AED"><i class="fas fa-sync-alt"></i> ${t('recurring_from_schedule')}</strong>
            <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px;color:#7C3AED;border-color:#7C3AED" onclick="navigate('recurring',{viewId:${o.recurring_schedule_id}})"><i class="fas fa-eye"></i> ${t('recurring_view_schedule')}</button>
          </div>
          ${data.recurring_schedule?`<div style="margin-top:6px;font-size:13px;color:#6D28D9">${frequencyLabel(data.recurring_schedule.frequency, data.recurring_schedule.interval_days)} &bull; ${t('recurring_next_delivery')}: ${formatDate(data.recurring_schedule.next_delivery_date)}</div>`:''}
        </div>`:''}
        ${cleanHoldMarkers(o.special_instructions)?`<div style="margin-top:16px;padding:12px;background:#FFF7ED;border-radius:8px;border-left:3px solid var(--orange)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:12px;color:var(--orange)"><i class="fas fa-exclamation-circle"></i> Special Instructions</strong>
            <div style="display:flex;gap:4px">
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px" onclick="translateInstructionInline(this,'${escapeHtml(cleanHoldMarkers(o.special_instructions)).replace(/'/g,"\\'")}','es')"><i class="fas fa-language"></i> ES</button>
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px" onclick="translateInstructionInline(this,'${escapeHtml(cleanHoldMarkers(o.special_instructions)).replace(/'/g,"\\'")}','ht')"><i class="fas fa-language"></i> HT</button>
            </div>
          </div>
          <div id="instrText_${o.id}" style="margin-top:4px;font-size:14px">${cleanHoldMarkers(o.special_instructions)}</div>
        </div>`:''}
      </div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3 class="card-title">Order Items</h3><span style="font-size:14px;color:var(--gray-500)">${items.length} items</span></div>
      <div class="table-container">
        <table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Qty</th><th>Unit</th></tr></thead>
        <tbody>${items.map(i => `<tr>
          <td><strong>${i.product_name}</strong></td><td><code style="font-size:12px;color:var(--gray-500)">${i.sku||'-'}</code></td>
          <td>${statusBadge(i.category)}</td><td>${i.quantity}</td>
          <td>${i.unit_type||'bags'}</td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    </div>
    ${(data.returns && data.returns.length > 0) ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="background:linear-gradient(135deg,#F5F3FF,#EDE9FE);border-bottom:2px solid #7C3AED">
        <h3 class="card-title"><i class="fas fa-rotate-left" style="color:#7C3AED;margin-right:8px"></i>Returns (${data.returns.length})</h3>
        <button class="btn btn-sm" style="background:#7C3AED;color:white;font-weight:700" onclick="showReturnModal(${o.id}, ${o.route_id || 'null'}, ${o.customer_id})"><i class="fas fa-plus"></i> Log Return</button>
      </div>
      <div class="card-body" style="padding:0">
        ${data.returns.map(r => {
          const totalExpected = (r.items||[]).reduce((s,i) => s + (i.expected_qty||0), 0);
          const totalActual = (r.items||[]).reduce((s,i) => s + (i.actual_qty||0), 0);
          const diff = totalActual - totalExpected;
          return `<div style="padding:14px 16px;border-bottom:1px solid var(--gray-100)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <strong style="color:#7C3AED;font-size:14px">#${r.id}</strong>
                ${statusBadge(r.status)}
                ${r.route_number ? `<span style="font-size:10px;background:#DBEAFE;color:#1D4ED8;padding:1px 5px;border-radius:3px"><i class="fas fa-route"></i> ${r.route_number}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:var(--gray-400)">${r.created_by_name||''} • ${formatDate(r.created_at)}</span>
                <button class="btn-icon" onclick="showReturnDetail(${r.id})" title="View details"><i class="fas fa-eye" style="color:#7C3AED"></i></button>
              </div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              ${(r.items||[]).map(it => {
                const idiff = (it.actual_qty||0) - (it.expected_qty||0);
                return `<div style="font-size:12px;padding:4px 8px;background:#F9FAFB;border-radius:4px;border:1px solid var(--gray-200)">
                  <strong>${it.product_name}</strong> ${it.sku?`<span style="color:var(--gray-400)">(${it.sku})</span>`:''}
                  <div style="margin-top:2px">
                    Expected: <strong>${it.expected_qty||0}</strong> &nbsp;
                    Actual: <strong style="color:${idiff!==0?'#DC2626':'#059669'}">${it.actual_qty||0}</strong>
                    ${idiff!==0?`<span style="color:#DC2626;font-weight:700"> (${idiff>0?'+':''}${idiff})</span>`:''}
                    ${it.reason?`<span style="color:var(--gray-400);margin-left:4px">${it.reason.replace(/_/g,' ')}</span>`:''}
                  </div>
                </div>`;
              }).join('')}
            </div>
            ${r.notes?`<div style="margin-top:6px;font-size:12px;color:var(--gray-500);padding:4px 8px;background:#FFF7ED;border-radius:4px"><i class="fas fa-sticky-note" style="color:var(--orange)"></i> ${escapeHtml(r.notes)}</div>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
    <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap">
      ${o.status==='new'?`<button class="btn btn-success" onclick="updateOrderStatus(${o.id},'confirmed')"><i class="fas fa-check"></i> Confirm</button>`:''}
      ${o.status==='confirmed'?`<button class="btn btn-primary" onclick="updateOrderStatus(${o.id},'scheduled')"><i class="fas fa-calendar"></i> Schedule</button>`:''}
      ${o.status==='scheduled'&&!o.route_id?`<button class="btn btn-outline" style="color:#2563EB;border-color:#2563EB" onclick="updateOrderStatus(${o.id},'confirmed')"><i class="fas fa-undo"></i> Revert to Confirmed</button>`:''}
      ${o.status==='scheduled'?`<button class="btn btn-warning" onclick="updateOrderStatus(${o.id},'loaded')"><i class="fas fa-box"></i> Mark Loaded</button>`:''}
      ${o.status==='loaded'?`<button class="btn btn-primary" onclick="updateOrderStatus(${o.id},'in_transit')"><i class="fas fa-truck"></i> In Transit</button>`:''}
      ${o.status==='in_transit'?`<button class="btn btn-success" onclick="updateOrderStatus(${o.id},'delivered')"><i class="fas fa-check-double"></i> Delivered</button>`:''}
      ${o.status==='delivered'?`<button class="btn btn-success" onclick="updateOrderStatus(${o.id},'completed')"><i class="fas fa-flag-checkered"></i> Complete</button>`:''}
      ${!['completed','cancelled','on_hold'].includes(o.status)?`<button class="btn btn-outline" style="color:#A855F7;border-color:#A855F7" onclick="showHoldOrderModal(${o.id},'${o.status}')"><i class="fas fa-pause-circle"></i> ${t('hold_put')}</button>`:''}
      ${o.status==='on_hold'?`<button class="btn btn-success" onclick="releaseOrderHold(${o.id})"><i class="fas fa-play-circle"></i> ${t('hold_release')}</button>`:''}
      ${!['completed','cancelled'].includes(o.status)?`<button class="btn btn-danger" onclick="updateOrderStatus(${o.id},'cancelled')"><i class="fas fa-times"></i> Cancel</button>`:''}
      <button class="btn btn-outline" onclick="showEditOrderModal(${o.id})"><i class="fas fa-edit"></i> Edit</button>
      <button class="btn btn-outline" style="color:#7C3AED;border-color:#7C3AED" onclick="showReturnModal(${o.id}, ${o.route_id || 'null'}, ${o.customer_id})"><i class="fas fa-rotate-left"></i> Log Return</button>
      ${['new','confirmed'].includes(o.status)?`<button class="btn btn-warning" onclick="showOrderBestDay(${o.id},'${escapeHtml(o.business_name)}','${o.order_number}')"><i class="fas fa-wand-magic-sparkles"></i> Best Day</button>`:''}
      ${!o.recurring_schedule_id && !['completed','cancelled'].includes(o.status)?`<button class="btn btn-outline" style="color:#7C3AED;border-color:#7C3AED" onclick="showMakeRecurringModal(${o.id},${o.customer_id},${o.address_id || 'null'},'${o.priority}','${escapeHtml(o.special_instructions||'')}')"><i class="fas fa-sync-alt"></i> ${t('recurring_make_recurring')}</button>`:''}
      ${archiveActionBtn('orders', o.id, o.archived, 'renderOrders')}
    </div>
    <!-- Order-level recommendation panel -->
    <div id="orderRecommendPanel" style="display:none;margin-top:16px"></div>
    <!-- Order location map -->
    ${o.lat && o.lng ? `
    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-map-marked-alt" style="color:var(--navy-light);margin-right:8px"></i>Delivery Location</h3>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="toggleOrderStreetView(${o.lat},${o.lng},'orderDetailMap','orderStreetViewContainer')" title="${t('street_view')}"><i class="fas fa-street-view" style="color:var(--green)"></i> ${t('street_view')}</button>
        </div>
      </div>
      <div id="orderDetailMap" style="height:300px;border-radius:0 0 12px 12px"></div>
      <div id="orderStreetViewContainer" style="display:none">
        <div class="streetview-container">
          <iframe id="orderStreetViewIframe" allowfullscreen></iframe>
        </div>
      </div>
    </div>` : ''}
    ${o.ticket_image ? `<div class="card" style="margin-top:20px"><div class="card-header"><h3 class="card-title"><i class="fas fa-receipt" style="color:var(--orange);margin-right:8px"></i>Original Ticket</h3>
      <button class="btn btn-outline btn-sm" onclick="viewTicketImage('${o.id}')"><i class="fas fa-expand"></i> View Full</button></div>
      <div class="card-body" style="text-align:center">
        <img src="${o.ticket_image}" alt="Order ticket" style="max-height:300px;max-width:100%;border-radius:8px;border:1px solid var(--gray-200);cursor:pointer" onclick="viewTicketImage('${o.id}')">
        <div style="font-size:11px;color:var(--gray-400);margin-top:6px"><i class="fas fa-receipt"></i> Scanned ticket image attached to this order</div>
      </div></div>` : ''}
    ${data.proof ? `<div class="card" style="margin-top:20px"><div class="card-header"><h3 class="card-title"><i class="fas fa-camera" style="color:var(--green);margin-right:8px"></i>Proof of Delivery</h3>
      <button class="btn btn-outline btn-sm" onclick="viewDeliveryProof(${o.id})"><i class="fas fa-expand"></i> View Full</button></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:${data.proof.photo_url && data.proof.photo_url.startsWith('data:') ? '1fr 1fr' : '1fr 1fr 1fr'};gap:16px;align-items:start">
          ${data.proof.photo_url && data.proof.photo_url.startsWith('data:') ? `<div style="text-align:center">
            <img src="${data.proof.photo_url}" alt="Delivery proof" style="max-height:200px;max-width:100%;border-radius:8px;border:1px solid var(--gray-200);cursor:pointer" onclick="viewDeliveryProof(${o.id})">
            <div style="font-size:11px;color:var(--gray-400);margin-top:4px"><i class="fas fa-camera"></i> Photo proof</div>
          </div>` : ''}
          <div>
            <div class="form-label">GPS Location</div>
            <div>${data.proof.gps_lat && data.proof.gps_lng ? `${Number(data.proof.gps_lat).toFixed(5)}, ${Number(data.proof.gps_lng).toFixed(5)}` : '-'}</div>
            <div class="form-label" style="margin-top:12px">Timestamp</div>
            <div>${data.proof.created_at ? dayjs(data.proof.created_at).format('MMM D, YYYY h:mm A') : formatDate(data.proof.created_at)}</div>
            ${data.proof.notes ? `<div class="form-label" style="margin-top:12px">Notes</div><div style="font-size:13px">${data.proof.notes}</div>` : ''}
          </div>
        </div>
      </div></div>` : ''}`;

  // Initialize order detail map if lat/lng available
  if (o.lat && o.lng) {
    initOrderDetailMap(o.lat, o.lng, o.business_name, o.street, o.city);
  }
}

async function updateOrderStatus(id, status) {
  try {
    await API.patch(`/orders/${id}/status`, { status });
    showToast(`Order updated to ${status}`);
    renderOrderDetail(id);
  } catch (err) { showToast('Failed to update', 'error'); }
}

function initOrderDetailMap(lat, lng, businessName, street, city) {
  setTimeout(() => {
    const mapEl = document.getElementById('orderDetailMap');
    if (!mapEl || !window.__gmapsLoaded) return;
    const depot = window.__DEPOT || DEPOT;
    const map = new google.maps.Map(mapEl, { center: { lat, lng }, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    window._orderDetailMap = map;
    // Depot marker
    new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#1E3A8A', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });
    // Delivery point marker
    const orderMarker = new google.maps.Marker({ position: { lat, lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: '#F97316', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: businessName, zIndex: 900 });
    const iw = new google.maps.InfoWindow({ content: `<strong>${businessName}</strong><br>${street || ''}, ${city || ''}` });
    orderMarker.addListener('click', () => iw.open(map, orderMarker));
    // Draw dashed line depot -> delivery
    new google.maps.Polyline({ path: [{ lat: depot.lat, lng: depot.lng }, { lat, lng }], geodesic: true, strokeColor: '#2563EB', strokeOpacity: 0.6, strokeWeight: 2, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }], map });
    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: depot.lat, lng: depot.lng });
    bounds.extend({ lat, lng });
    map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
  }, 100);
}

async function showOrderBestDay(orderId, businessName, orderNumber) {
  renderBestDayPanel('orderRecommendPanel', orderId, businessName, orderNumber, () => renderOrderDetail(orderId));
}

async function applyRecommendationFromOrder(orderId, date, orderNumber) {
  if (!confirm(`Schedule ${orderNumber} for ${date}?`)) return;
  try {
    await API.put(`/orders/${orderId}`, { scheduled_date: date, status: 'confirmed' });
    showToast(`${orderNumber} scheduled for ${date}!`);
    renderOrderDetail(orderId);
  } catch (err) { showToast('Failed to schedule', 'error'); }
}

// ==================== NEW ORDER MODAL ====================
async function showNewOrderModal() {
  const [custData, prodData] = await Promise.all([API.get('/customers'), API.get('/products')]);
  let selectedItems = [];

  // Store data globally for OCR matching
  window._custList = custData.data.customers;
  window._prodList = prodData.data.products;

  // Check if server has OCR configured
  let serverOcrReady = false;
  try {
    const ocrStatus = await API.get('/ocr/status');
    serverOcrReady = ocrStatus.data.configured;
  } catch (e) { /* ignore */ }
  window._serverOcrReady = serverOcrReady;

  const hasUserKey = !!localStorage.getItem('bf_openai_key');
  const ocrReady = serverOcrReady || hasUserKey;
  const ocrStatusHtml = serverOcrReady
    ? '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Ready</span>'
    : (hasUserKey
      ? '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Custom key</span>'
      : '<span style="color:var(--orange)"><i class="fas fa-exclamation-circle"></i> Setup needed</span>');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-clipboard-list" style="color:var(--navy-light);margin-right:8px"></i>New Order</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">

      <!-- TICKET UPLOAD SECTION -->
      <div class="ticket-scan-card" style="margin-bottom:20px">
        <div class="ticket-scan-header">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="ticket-scan-icon"><i class="fas fa-camera"></i></div>
            <div>
              <h4 style="font-size:15px;font-weight:700;margin:0">Smart Ticket Scan</h4>
              <div style="font-size:11px;color:var(--gray-500)">Upload a printed ticket photo to auto-fill the order</div>
            </div>
          </div>
          <span class="badge badge-normal" style="font-size:11px" id="ocrStatusBadge">${ocrStatusHtml}</span>
        </div>
        <div class="ticket-scan-body">
          <div class="ticket-upload-area" id="ticketUploadArea">
            <div id="ticketPlaceholder">
              <div class="ticket-upload-icon"><i class="fas fa-file-image"></i></div>
              <div class="ticket-upload-text">Upload or snap a photo of the order ticket</div>
              <div class="ticket-upload-hint">Supports camera capture, JPG, PNG &bull; AI will auto-extract order details</div>
              <div class="ticket-actions">
                <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden"><i class="fas fa-upload"></i> Upload File(s)<input type="file" accept="*/*" multiple style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="handleTicketFile(event)"></label>
                <button class="btn btn-outline btn-sm" onclick="startCameraCapture()"><i class="fas fa-camera"></i> Take Photo</button>
                <button class="btn btn-outline btn-sm" onclick="sqBatchUpload()" title="Open batch scan queue"><i class="fas fa-layer-group"></i> Batch</button>
              </div>
            </div>
            <div id="ticketPreviewContainer" style="display:none">
              <img id="ticketPreviewImg" class="ticket-preview" alt="Ticket preview">
              <div class="ticket-actions">
                <button class="btn btn-warning btn-sm" id="scanTicketBtn" onclick="scanTicketImage()"><i class="fas fa-magic"></i> Scan Ticket</button>
                <button class="btn btn-outline btn-sm" onclick="clearTicketUpload()"><i class="fas fa-trash"></i> Remove</button>
                <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden"><i class="fas fa-redo"></i> Retake<input type="file" accept="*/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="handleTicketFile(event)"></label>
              </div>
            </div>
            <div id="ticketScanOverlay" class="scan-overlay" style="display:none">
              <i class="fas fa-cog fa-spin fa-2x" style="color:var(--orange)"></i>
              <div style="font-weight:600;color:var(--gray-700);margin-top:10px">Scanning ticket with AI...</div>
              <div style="font-size:12px;color:var(--gray-500)">Extracting customer, products, and details</div>
              <div class="scan-progress"><div class="scan-progress-bar"></div></div>
            </div>
          </div>

          <div id="scanResultBanner"></div>
          ${!serverOcrReady ? `<div style="margin-top:10px;padding:10px 12px;background:var(--gray-50);border-radius:8px;border:1px solid var(--gray-200)">
            <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleApiKeySettings()">
              <div style="font-size:12px;color:var(--gray-500)"><i class="fas fa-cog"></i> AI Settings <span id="apiKeyStatus">${hasUserKey ? '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Key set</span>' : '<span style="color:var(--orange)"><i class="fas fa-exclamation-circle"></i> API key needed for scanning</span>'}</span></div>
              <i class="fas fa-chevron-down" style="font-size:10px;color:var(--gray-400)" id="apiKeyChevron"></i>
            </div>
            <div id="apiKeySettings" style="display:none;margin-top:10px">
              <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px">Enter an OpenAI-compatible API key to enable AI ticket scanning. Stored locally in your browser only.</div>
              <div style="display:flex;gap:8px">
                <input class="form-input" type="password" id="ocrApiKeyInput" placeholder="sk-... (OpenAI API key)" value="${localStorage.getItem('bf_openai_key') || ''}" style="font-size:13px;flex:1">
                <button class="btn btn-primary btn-sm" onclick="saveApiKey()"><i class="fas fa-save"></i> Save</button>
              </div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <input class="form-input" type="text" id="ocrBaseUrlInput" placeholder="Base URL (leave empty for default)" value="${localStorage.getItem('bf_openai_url') || ''}" style="font-size:12px;flex:1">
                <select class="form-select" id="ocrModelSelect" style="width:200px;font-size:12px">
                  <option value="gpt-5-mini" ${(localStorage.getItem('bf_openai_model')||'gpt-5-mini')==='gpt-5-mini'?'selected':''}>GPT-5 Mini (Recommended)</option>
                  <option value="gpt-5-nano" ${localStorage.getItem('bf_openai_model')==='gpt-5-nano'?'selected':''}>GPT-5 Nano (Fast/Cheap)</option>
                  <option value="gpt-5" ${localStorage.getItem('bf_openai_model')==='gpt-5'?'selected':''}>GPT-5 (Best Quality)</option>
                  <option value="gpt-5.1" ${localStorage.getItem('bf_openai_model')==='gpt-5.1'?'selected':''}>GPT-5.1</option>
                  <option value="gpt-5.2" ${localStorage.getItem('bf_openai_model')==='gpt-5.2'?'selected':''}>GPT-5.2</option>
                </select>
              </div>
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- ORDER FORM FIELDS -->
      <div class="form-row">
        <div class="form-group" style="flex:0 0 200px"><label class="form-label">Order # <span style="font-size:10px;color:var(--gray-400)">(from ticket or auto)</span></label>
          <input class="form-input" id="newOrderNumber" placeholder="Auto-generated if empty" style="font-family:monospace;font-weight:600">
        </div>
        <div class="form-group" style="flex:1"><label class="form-label">Customer *</label>
          <select class="form-select" id="newOrderCustomer" onchange="handleCustomerChange(this.value)">
            <option value="">Select customer...</option>
            ${custData.data.customers.map(c => `<option value="${c.id}">${c.business_name}</option>`).join('')}
            <option value="__new__" style="font-weight:bold;color:var(--navy)">➕ Add New Customer...</option>
          </select>
          <div id="newCustomerInline" style="display:none;margin-top:8px;padding:12px;background:var(--green-bg,#f0fdf4);border:1px solid #bbf7d0;border-radius:8px">
            <div style="font-size:12px;font-weight:700;color:var(--green,#16a34a);margin-bottom:8px"><i class="fas fa-user-plus"></i> New Customer</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" style="font-size:11px">Business/Farm Name *</label><input class="form-input" id="inlineNewCustName" placeholder="Exact name from ticket"></div>
              <div class="form-group"><label class="form-label" style="font-size:11px">Contact Name</label><input class="form-input" id="inlineNewCustContact" placeholder="Contact person"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" style="font-size:11px">Phone</label><input class="form-input" id="inlineNewCustPhone" placeholder="Phone number"></div>
              <div class="form-group"><label class="form-label" style="font-size:11px">Type</label>
                <select class="form-select" id="inlineNewCustType"><option value="farm">Farm</option><option value="ranch">Ranch</option><option value="equestrian">Equestrian</option><option value="retail">Retail</option><option value="other">Other</option></select>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveInlineCustomer()"><i class="fas fa-save"></i> Save & Select</button>
            <button class="btn btn-outline btn-sm" onclick="cancelInlineCustomer()" style="margin-left:4px">Cancel</button>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Delivery Address</label>
          <select class="form-select" id="newOrderAddress"><option value="">Select customer first...</option></select>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Priority</label>
          <select class="form-select" id="newOrderPriority">
            <option value="normal">Normal</option><option value="urgent">Urgent</option><option value="high">High</option><option value="low">Low</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Scheduled Date</label><input class="form-input" type="date" id="newOrderDate"></div>
      </div>
      <div class="form-group"><label class="form-label">Special Instructions</label><textarea class="form-textarea" id="newOrderInstructions" rows="2" placeholder="Delivery notes..."></textarea></div>
      <div class="card" style="margin-top:8px">
        <div class="card-header"><h4 class="card-title">Order Items</h4>
          <div style="display:flex;gap:6px;align-items:center">
            <select class="form-select" id="addProductSelect" style="width:250px">
              <option value="">+ Add product...</option>
              ${prodData.data.products.map(p => `<option value="${p.id}" data-name="${p.name}" data-sku="${p.sku}" data-unit="${p.unit_type}">${p.name} (${p.unit_type})</option>`).join('')}
              <option value="__new__" style="font-weight:bold;color:var(--navy)">➕ Add New Product...</option>
            </select>
          </div>
        </div>
        <div id="newProductInline" style="display:none;margin:8px 12px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
          <div style="font-size:12px;font-weight:700;color:var(--navy-light,#2563eb);margin-bottom:8px"><i class="fas fa-box"></i> New Product</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label" style="font-size:11px">Product Name *</label><input class="form-input" id="inlineNewProdName" placeholder="Exact name from ticket"></div>
            <div class="form-group"><label class="form-label" style="font-size:11px">SKU</label><input class="form-input" id="inlineNewProdSku" placeholder="Product code"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label" style="font-size:11px">Weight/Unit (lbs)</label><input class="form-input" type="number" id="inlineNewProdWeight" value="50" min="1"></div>
            <div class="form-group"><label class="form-label" style="font-size:11px">Unit Type</label>
              <select class="form-select" id="inlineNewProdUnit"><option value="bag">Bag</option><option value="bale">Bale</option><option value="pail">Pail</option><option value="block">Block</option><option value="each">Each</option></select>
            </div>
            <div class="form-group"><label class="form-label" style="font-size:11px">Category</label>
              <select class="form-select" id="inlineNewProdCat"><option value="horse">Horse</option><option value="cattle">Cattle</option><option value="poultry">Poultry</option><option value="swine">Swine</option><option value="goat">Goat</option><option value="supplement">Supplement</option><option value="other">Other</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label" style="font-size:11px">Price ($)</label><input class="form-input" type="number" id="inlineNewProdPrice" value="0" min="0" step="0.01"></div>
            <div class="form-group"><label class="form-label" style="font-size:11px">Quantity to Add</label><input class="form-input" type="number" id="inlineNewProdQty" value="1" min="1"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="saveInlineProduct()"><i class="fas fa-save"></i> Save & Add to Order</button>
          <button class="btn btn-outline btn-sm" onclick="cancelInlineProduct()" style="margin-left:4px">Cancel</button>
        </div>
        <div id="orderItemsList" style="padding:12px"><div class="empty-state" style="padding:20px"><p>No items added yet</p></div></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewOrder()"><i class="fas fa-check"></i> Create Order</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  window._newOrderItems = [];
  window._ticketImageData = null;
  document.getElementById('addProductSelect').onchange = function() {
    if (!this.value) return;
    if (this.value === '__new__') {
      this.value = '';
      document.getElementById('newProductInline').style.display = 'block';
      document.getElementById('inlineNewProdName').focus();
      return;
    }
    const opt = this.options[this.selectedIndex];
    window._newOrderItems.push({ product_id: parseInt(this.value), name: opt.dataset.name, sku: opt.dataset.sku, unit: opt.dataset.unit || 'bags', quantity: 1 });
    this.value = '';
    renderOrderItems();
  };
}

// ==================== INLINE NEW CUSTOMER / PRODUCT ====================
function handleCustomerChange(val) {
  if (val === '__new__') {
    document.getElementById('newOrderCustomer').value = '';
    document.getElementById('newCustomerInline').style.display = 'block';
    document.getElementById('inlineNewCustName').focus();
    return;
  }
  document.getElementById('newCustomerInline').style.display = 'none';
  if (val) loadCustomerAddresses(val);
}

async function saveInlineCustomer() {
  const name = document.getElementById('inlineNewCustName').value.trim();
  if (!name) { showToast('Customer name is required', 'warning'); return; }
  try {
    const { data } = await API.post('/customers', {
      business_name: name,
      contact_name: document.getElementById('inlineNewCustContact').value.trim() || null,
      phone: document.getElementById('inlineNewCustPhone').value.trim() || null,
      customer_type: document.getElementById('inlineNewCustType').value,
    });
    // Add to dropdown and select it
    const sel = document.getElementById('newOrderCustomer');
    const newOpt = document.createElement('option');
    newOpt.value = data.id;
    newOpt.textContent = name;
    // Insert before the __new__ option
    const newOptRef = sel.querySelector('option[value="__new__"]');
    sel.insertBefore(newOpt, newOptRef);
    sel.value = data.id;
    // Add to global list
    if (window._custList) window._custList.push(data.customer || { id: data.id, business_name: name });
    document.getElementById('newCustomerInline').style.display = 'none';
    showToast(`Customer "${name}" created!`, 'success');
    // Clear address since new customer has none yet
    document.getElementById('newOrderAddress').innerHTML = '<option value="">No addresses yet</option>';
  } catch (err) { showToast('Failed to create customer: ' + (err.response?.data?.error || err.message), 'error'); }
}

function cancelInlineCustomer() {
  document.getElementById('newCustomerInline').style.display = 'none';
  document.getElementById('newOrderCustomer').value = '';
}

async function saveInlineProduct() {
  const name = document.getElementById('inlineNewProdName').value.trim();
  if (!name) { showToast('Product name is required', 'warning'); return; }
  const weight = parseFloat(document.getElementById('inlineNewProdWeight').value) || 50;
  const qty = parseInt(document.getElementById('inlineNewProdQty').value) || 1;
  try {
    const { data } = await API.post('/products', {
      name: name,
      sku: document.getElementById('inlineNewProdSku').value.trim() || null,
      category: document.getElementById('inlineNewProdCat').value,
      weight_per_unit: weight,
      unit_type: document.getElementById('inlineNewProdUnit').value,
      price: parseFloat(document.getElementById('inlineNewProdPrice').value) || 0,
      stock_quantity: 0,
    });
    const prod = data.product || { id: data.id, name, weight_per_unit: weight, sku: document.getElementById('inlineNewProdSku').value.trim() || '' };
    // Add to dropdown
    const sel = document.getElementById('addProductSelect');
    const newOpt = document.createElement('option');
    newOpt.value = prod.id;
    newOpt.dataset.name = prod.name;
    newOpt.dataset.sku = prod.sku || '';
    newOpt.dataset.unit = document.getElementById('inlineNewProdUnit').value;
    newOpt.textContent = `${prod.name} (${document.getElementById('inlineNewProdUnit').value})`;
    const newOptRef = sel.querySelector('option[value="__new__"]');
    sel.insertBefore(newOpt, newOptRef);
    // Add to global list
    if (window._prodList) window._prodList.push(prod);
    // Add to order items
    window._newOrderItems.push({ product_id: prod.id, name: prod.name, sku: prod.sku || '', unit: document.getElementById('inlineNewProdUnit').value, quantity: qty });
    renderOrderItems();
    document.getElementById('newProductInline').style.display = 'none';
    // Reset form
    document.getElementById('inlineNewProdName').value = '';
    document.getElementById('inlineNewProdSku').value = '';
    document.getElementById('inlineNewProdWeight').value = '50';
    document.getElementById('inlineNewProdPrice').value = '0';
    document.getElementById('inlineNewProdQty').value = '1';
    showToast(`Product "${prod.name}" created & added!`, 'success');
  } catch (err) { showToast('Failed to create product: ' + (err.response?.data?.error || err.message), 'error'); }
}

function cancelInlineProduct() {
  document.getElementById('newProductInline').style.display = 'none';
  document.getElementById('addProductSelect').value = '';
}

// ==================== TICKET UPLOAD & OCR ====================
function handleTicketFile(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  // First file goes to the current modal's single-ticket flow
  const firstFile = files[0];
  compressImage(firstFile, 1200, 0.6).then(compressed => {
    window._ticketImageData = compressed;
    showTicketPreview(compressed);
  });
  // If multiple files were selected, send extras to the background scan queue
  if (files.length > 1) {
    sqShow();
    for (let i = 1; i < files.length; i++) {
      sqAddFile(files[i]);
    }
    showToast(`${files.length - 1} additional ticket(s) sent to background scan queue`, 'info');
  }
}

function compressImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function triggerTicketUpload(event) {
  // Only trigger if tapping the area itself, not a button inside it
  if (event.target.closest('.ticket-actions') || event.target.closest('button') || event.target.closest('label')) return;
  // Create a fresh input without capture to get gallery picker
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = '*/*';
  tempInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  tempInput.onchange = function(e) { handleTicketFile(e); tempInput.remove(); };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function startCameraCapture() {
  // Create a temporary input with capture for camera-only
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = 'image/*';
  tempInput.capture = 'environment';
  tempInput.style.display = 'none';
  tempInput.onchange = function(e) { handleTicketFile(e); tempInput.remove(); };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function showTicketPreview(dataUrl) {
  document.getElementById('ticketPlaceholder').style.display = 'none';
  document.getElementById('ticketPreviewContainer').style.display = 'block';
  document.getElementById('ticketPreviewImg').src = dataUrl;
  document.getElementById('ticketUploadArea').classList.add('has-image');
  document.getElementById('scanResultBanner').innerHTML = '';
}

function clearTicketUpload() {
  window._ticketImageData = null;

  document.getElementById('ticketPlaceholder').style.display = 'block';
  document.getElementById('ticketPreviewContainer').style.display = 'none';
  document.getElementById('ticketUploadArea').classList.remove('has-image', 'scanning');
  document.getElementById('scanResultBanner').innerHTML = '';
}

async function scanTicketImage() {
  if (!window._ticketImageData) {
    showToast('Please upload a ticket image first', 'warning');
    return;
  }

  // Check if OCR is available: server key OR user key
  const hasUserKey = localStorage.getItem('bf_openai_key');
  const ocrAvailable = window._serverOcrReady || hasUserKey;
  if (!ocrAvailable) {
    showToast('Please configure an API key in AI Settings to enable scanning', 'warning');
    const settingsEl = document.getElementById('apiKeySettings');
    if (settingsEl && settingsEl.style.display === 'none') toggleApiKeySettings();
    return;
  }

  const uploadArea = document.getElementById('ticketUploadArea');
  const overlay = document.getElementById('ticketScanOverlay');
  const scanBtn = document.getElementById('scanTicketBtn');
  const bannerEl = document.getElementById('scanResultBanner');

  // Show scanning state
  uploadArea.classList.add('scanning');
  overlay.style.display = 'flex';
  scanBtn.disabled = true;
  bannerEl.innerHTML = '';

  try {
    // Build request payload - include user key if they have one (overrides server key)
    const payload = { image: window._ticketImageData };
    if (hasUserKey) {
      payload.api_key = localStorage.getItem('bf_openai_key');
      payload.base_url = localStorage.getItem('bf_openai_url') || undefined;
    }
    // Always send the selected model if user has a preference
    const userModel = localStorage.getItem('bf_openai_model');
    if (userModel) payload.model = userModel;

    const { data } = await API.post('/ocr/scan-ticket', payload);

    overlay.style.display = 'none';
    uploadArea.classList.remove('scanning');
    scanBtn.disabled = false;

    if (!data.success || !data.data) {
      bannerEl.innerHTML = `<div class="scan-result-banner error"><i class="fas fa-exclamation-circle"></i> Could not extract order details. Please fill in manually.</div>`;
      return;
    }

    const result = data.data;
    const overallConf = result.confidence || 0;
    const confClass = overallConf >= 0.7 ? 'high' : overallConf >= 0.4 ? 'medium' : 'low';
    const confLabel = overallConf >= 0.7 ? 'High' : overallConf >= 0.4 ? 'Medium' : 'Low';

    // Build result banner
    let bannerHtml = `<div class="scan-result-banner success">
      <i class="fas fa-check-circle"></i>
      <div style="flex:1">
        <strong>Ticket scanned successfully!</strong>
        <span class="confidence-badge confidence-${confClass}" style="margin-left:8px"><i class="fas fa-signal"></i> ${Math.round(overallConf*100)}% ${confLabel} Confidence</span>
        <div style="font-size:12px;color:var(--gray-600);margin-top:4px">Fields have been auto-filled below. Please review and adjust as needed.</div>
      </div>
    </div>`;

    // Show raw text if available
    if (result.raw_text) {
      bannerHtml += `<div style="margin-top:8px;padding:10px 12px;background:var(--gray-50);border-radius:8px;border:1px solid var(--gray-200)">
        <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-bottom:4px"><i class="fas fa-align-left"></i> Extracted Text</div>
        <div style="font-size:12px;color:var(--gray-600);white-space:pre-wrap;font-family:monospace;max-height:80px;overflow-y:auto">${escapeHtml(result.raw_text)}</div>
      </div>`;
    }

    // Show per-field confidence indicators
    let fieldsHtml = '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">';
    if (result.customer_id) {
      const cc = result.customer_confidence || overallConf;
      const ccClass = cc >= 0.7 ? 'high' : cc >= 0.4 ? 'medium' : 'low';
      fieldsHtml += `<span class="confidence-badge confidence-${ccClass}"><i class="fas fa-user"></i> Customer ${Math.round(cc*100)}%</span>`;
    }
    if (result.items && result.items.length > 0) {
      result.items.forEach((item, i) => {
        const pc = item.product_confidence || overallConf;
        const pcClass = pc >= 0.7 ? 'high' : pc >= 0.4 ? 'medium' : 'low';
        fieldsHtml += `<span class="confidence-badge confidence-${pcClass}"><i class="fas fa-box"></i> ${item.product_name ? item.product_name.substring(0,20) : 'Item '+(i+1)} ${Math.round(pc*100)}%</span>`;
      });
    }
    fieldsHtml += '</div>';
    bannerHtml += fieldsHtml;

    bannerEl.innerHTML = bannerHtml;

    // AUTO-FILL FORM FIELDS

    // 1. Customer — match existing or auto-create from ticket name with full info
    if (result.customer_id) {
      const custSelect = document.getElementById('newOrderCustomer');
      custSelect.value = result.customer_id;
      custSelect.classList.add('ocr-field-highlight');
      setTimeout(() => custSelect.classList.remove('ocr-field-highlight'), 2000);
      await loadCustomerAddresses(result.customer_id);

      // Compare ticket address against existing addresses
      const ticketAddr = result.delivery_address;
      const existingAddrs = result.addresses || [];
      let matchedAddrId = null;

      if (ticketAddr && ticketAddr.street && existingAddrs.length > 0) {
        // Normalize: lowercase, strip extra spaces, remove trailing punctuation
        const norm = (s) => (s || '').toLowerCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim();
        const ticketStreetNorm = norm(ticketAddr.street);
        for (const ea of existingAddrs) {
          if (norm(ea.street) === ticketStreetNorm) { matchedAddrId = ea.id; break; }
        }
        // Fallback: partial match (ticket street starts with or contains existing street)
        if (!matchedAddrId) {
          for (const ea of existingAddrs) {
            const existNorm = norm(ea.street);
            if (existNorm && ticketStreetNorm && (ticketStreetNorm.includes(existNorm) || existNorm.includes(ticketStreetNorm))) {
              matchedAddrId = ea.id; break;
            }
          }
        }
      }

      if (matchedAddrId) {
        // Address matched — select it
        const addrSelect = document.getElementById('newOrderAddress');
        addrSelect.value = matchedAddrId;
        addrSelect.classList.add('ocr-field-highlight');
        setTimeout(() => addrSelect.classList.remove('ocr-field-highlight'), 2000);
      } else if (ticketAddr && ticketAddr.street) {
        // Customer matched but address is NEW — auto-create address for this customer
        try {
          const { data: newAddr } = await API.post('/addresses', {
            customer_id: result.customer_id,
            label: 'From Ticket',
            street: ticketAddr.street,
            city: ticketAddr.city || 'Wellington',
            state: ticketAddr.state || 'FL',
            zip: ticketAddr.zip || null,
            is_primary: 0,
          });
          // Reload addresses so the new one appears in the dropdown
          await loadCustomerAddresses(result.customer_id);
          const addrSelect = document.getElementById('newOrderAddress');
          if (newAddr.id) { addrSelect.value = newAddr.id; }
          addrSelect.classList.add('ocr-field-highlight');
          setTimeout(() => addrSelect.classList.remove('ocr-field-highlight'), 2000);
          // Address silently added — no banner needed
        } catch (e) { console.error('Auto-create address for existing customer failed:', e); }
      } else if (existingAddrs.length > 0) {
        // No ticket address — just pick the first existing
        const addrSelect = document.getElementById('newOrderAddress');
        addrSelect.value = existingAddrs[0].id;
        addrSelect.classList.add('ocr-field-highlight');
        setTimeout(() => addrSelect.classList.remove('ocr-field-highlight'), 2000);
      }
    } else if (result.customer_name) {
      // Customer not matched — auto-create with exact ticket name + address + phone + email
      try {
        const custPayload = {
          business_name: result.customer_name,
          contact_name: result.contact_name || null,
          phone: result.phone || null,
          email: result.email || null,
          customer_type: 'farm',
        };
        // Include address if extracted from ticket
        if (result.delivery_address && result.delivery_address.street) {
          custPayload.address = {
            street: result.delivery_address.street,
            city: result.delivery_address.city || 'Wellington',
            state: result.delivery_address.state || 'FL',
            zip: result.delivery_address.zip || null,
          };
        }
        const { data: newCust } = await API.post('/customers', custPayload);
        const custSelect = document.getElementById('newOrderCustomer');
        const newOpt = document.createElement('option');
        newOpt.value = newCust.id;
        newOpt.textContent = result.customer_name;
        const newOptRef = custSelect.querySelector('option[value="__new__"]');
        custSelect.insertBefore(newOpt, newOptRef);
        custSelect.value = newCust.id;
        custSelect.classList.add('ocr-field-highlight');
        setTimeout(() => custSelect.classList.remove('ocr-field-highlight'), 2000);
        if (window._custList) window._custList.push(newCust.customer || { id: newCust.id, business_name: result.customer_name });
        // Load addresses for newly created customer (if address was created)
        await loadCustomerAddresses(newCust.id);
        let custInfo = `"<strong>${escapeHtml(result.customer_name)}</strong>"`;
        if (result.delivery_address?.street) custInfo += ` with address ${escapeHtml(result.delivery_address.street)}`;
        if (result.phone) custInfo += `, phone ${escapeHtml(result.phone)}`;
        bannerEl.innerHTML += `<div style="margin-top:6px;padding:6px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px"><i class="fas fa-user-plus" style="color:#16a34a"></i> New customer ${custInfo} created from ticket</div>`;
      } catch (e) { console.error('Auto-create customer failed:', e); }
    }

    // 2. Order number from ticket
    if (result.order_number) {
      const orderNumInput = document.getElementById('newOrderNumber');
      orderNumInput.value = result.order_number;
      orderNumInput.classList.add('ocr-field-highlight');
      setTimeout(() => orderNumInput.classList.remove('ocr-field-highlight'), 2000);
    }

    // 3. Priority
    if (result.priority && result.priority !== 'normal') {
      const prioSelect = document.getElementById('newOrderPriority');
      prioSelect.value = result.priority;
      prioSelect.classList.add('ocr-field-highlight');
      setTimeout(() => prioSelect.classList.remove('ocr-field-highlight'), 2000);
    }

    // 3. Delivery date
    if (result.delivery_date) {
      const dateInput = document.getElementById('newOrderDate');
      dateInput.value = result.delivery_date;
      dateInput.classList.add('ocr-field-highlight');
      setTimeout(() => dateInput.classList.remove('ocr-field-highlight'), 2000);
    }

    // 4. Special instructions
    if (result.special_instructions) {
      const instrEl = document.getElementById('newOrderInstructions');
      instrEl.value = result.special_instructions;
      instrEl.classList.add('ocr-field-highlight');
      setTimeout(() => instrEl.classList.remove('ocr-field-highlight'), 2000);
    }

    // 5. Order items — match existing products or auto-create with SKU/price from ticket
    let newProductsCreated = [];
    if (result.items && result.items.length > 0) {
      window._newOrderItems = [];
      for (const item of result.items) {
        if (item.product_id) {
          // Known product matched
          const prod = window._prodList.find(p => p.id === item.product_id);
          if (prod) {
            window._newOrderItems.push({
              product_id: prod.id,
              name: prod.name,
              sku: prod.sku,
              unit: prod.unit_type || 'bag',
              quantity: item.quantity || 1
            });
          }
        } else if (item.product_name) {
          // Unmatched product — auto-create with exact ticket name, SKU from PLU, and price
          try {
            const { data: newProd } = await API.post('/products', {
              name: item.product_name,
              sku: item.sku || null,
              category: 'other',
              weight_per_unit: 50,
              unit_type: 'bag',
              price: item.price || 0,
            });
            const prod = newProd.product || { id: newProd.id, name: item.product_name, sku: item.sku || '', unit_type: 'bag' };
            // Add to dropdown
            const sel = document.getElementById('addProductSelect');
            const newOpt = document.createElement('option');
            newOpt.value = prod.id;
            newOpt.dataset.name = prod.name;
            newOpt.dataset.sku = prod.sku || '';
            newOpt.dataset.unit = prod.unit_type || 'bag';
            newOpt.textContent = `${prod.name} (${prod.unit_type || 'bag'})`;
            const newOptRef = sel.querySelector('option[value="__new__"]');
            sel.insertBefore(newOpt, newOptRef);
            if (window._prodList) window._prodList.push(prod);
            window._newOrderItems.push({
              product_id: prod.id,
              name: prod.name,
              sku: prod.sku || item.sku || '',
              unit: prod.unit_type || 'bag',
              quantity: item.quantity || 1
            });
            newProductsCreated.push(`${item.product_name}${item.sku ? ' (PLU:'+item.sku+')' : ''}${item.price ? ' $'+item.price : ''}`);
          } catch (e) { console.error('Auto-create product failed:', e); }
        }
      }
      renderOrderItems();
      const itemsEl = document.getElementById('orderItemsList');
      if (itemsEl) {
        itemsEl.classList.add('ocr-field-highlight');
        setTimeout(() => itemsEl.classList.remove('ocr-field-highlight'), 2000);
      }
    }

    // Show auto-created products notification
    if (newProductsCreated.length > 0) {
      const prodNames = newProductsCreated.map(n => `"<strong>${escapeHtml(n)}</strong>"`).join(', ');
      bannerEl.innerHTML += `<div style="margin-top:6px;padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px"><i class="fas fa-box" style="color:#2563eb"></i> New product(s) ${prodNames} created from ticket</div>`;
    }

    showToast('Ticket scanned! Review the auto-filled fields.', 'success');

  } catch (err) {
    console.error('Scan error:', err);
    overlay.style.display = 'none';
    uploadArea.classList.remove('scanning');
    scanBtn.disabled = false;
    const errData = err.response?.data;
    const isCreditsError = errData?.creditError || err.response?.status === 402;
    if (isCreditsError) {
      bannerEl.innerHTML = `<div class="scan-result-banner error" style="flex-direction:column;align-items:flex-start">
        <div><i class="fas fa-exclamation-triangle" style="color:#f59e0b"></i> <strong>Insufficient API Credits</strong></div>
        <div style="font-size:13px;margin-top:6px;color:var(--gray-600)">The AI scanning service has run out of credits. To fix this:</div>
        <ul style="font-size:12px;margin:6px 0 0 16px;color:var(--gray-600);list-style:disc">
          <li>Open <strong>AI Settings</strong> below and enter your own OpenAI API key</li>
          <li>Or contact your administrator to add credits to the GenSpark account</li>
        </ul>
      </div>`;
      // Auto-open AI settings so user can add their key
      const settingsEl = document.getElementById('apiKeySettings');
      if (settingsEl) settingsEl.style.display = 'block';
      showToast('Insufficient API credits — configure your own API key', 'error');
    } else {
      bannerEl.innerHTML = `<div class="scan-result-banner error"><i class="fas fa-exclamation-circle"></i> Scan failed: ${errData?.error || err.message || 'Unknown error'}. Please fill in manually.</div>`;
      showToast('Ticket scan failed', 'error');
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleApiKeySettings() {
  const el = document.getElementById('apiKeySettings');
  const chevron = document.getElementById('apiKeyChevron');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    chevron.classList.replace('fa-chevron-down', 'fa-chevron-up');
  } else {
    el.style.display = 'none';
    chevron.classList.replace('fa-chevron-up', 'fa-chevron-down');
  }
}

function saveApiKey() {
  const key = document.getElementById('ocrApiKeyInput').value.trim();
  const url = document.getElementById('ocrBaseUrlInput').value.trim();
  const model = document.getElementById('ocrModelSelect').value;
  if (key) {
    localStorage.setItem('bf_openai_key', key);
    localStorage.setItem('bf_openai_url', url);
    localStorage.setItem('bf_openai_model', model);
    document.getElementById('apiKeyStatus').innerHTML = '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Key configured</span>';
    showToast('API key saved! You can now scan tickets.', 'success');
  } else {
    localStorage.removeItem('bf_openai_key');
    localStorage.removeItem('bf_openai_url');
    localStorage.removeItem('bf_openai_model');
    document.getElementById('apiKeyStatus').innerHTML = '<span style="color:var(--orange)"><i class="fas fa-exclamation-circle"></i> API key needed</span>';
    showToast('API key removed', 'info');
  }
}

function renderOrderItems() {
  const el = document.getElementById('orderItemsList');
  if (window._newOrderItems.length === 0) { el.innerHTML = '<div class="empty-state" style="padding:20px"><p>No items added yet</p></div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th></th></tr></thead><tbody>${window._newOrderItems.map((item, i) => {
    return `<tr><td><strong>${item.name}</strong><br><code style="font-size:11px">${item.sku||''}</code></td>
      <td><input type="number" class="form-input" value="${item.quantity}" min="1" style="width:70px" onchange="window._newOrderItems[${i}].quantity=parseInt(this.value);renderOrderItems()"></td>
      <td>${item.unit||'bags'}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="window._newOrderItems.splice(${i},1);renderOrderItems()"><i class="fas fa-trash"></i></button></td></tr>`;
  }).join('')}</tbody></table>`;
}

async function loadCustomerAddresses(custId) {
  if (!custId) return;
  const { data } = await API.get(`/customers/${custId}`);
  const sel = document.getElementById('newOrderAddress');
  sel.innerHTML = data.addresses.map(a => `<option value="${a.id}">${a.label}: ${a.street}, ${a.city}</option>`).join('');
}

async function submitNewOrder() {
  const customer_id = document.getElementById('newOrderCustomer').value;
  if (!customer_id || customer_id === '__new__') { showToast('Please select a customer', 'warning'); return; }
  if (window._newOrderItems.length === 0) { showToast('Please add at least one item', 'warning'); return; }
  try {
    const { data } = await API.post('/orders', {
      customer_id: parseInt(customer_id),
      address_id: parseInt(document.getElementById('newOrderAddress').value) || null,
      order_number: document.getElementById('newOrderNumber').value.trim() || null,
      priority: document.getElementById('newOrderPriority').value,
      scheduled_date: document.getElementById('newOrderDate').value || null,
      special_instructions: document.getElementById('newOrderInstructions').value || null,
      items: window._newOrderItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      created_by: currentUser.id,
      ticket_image: window._ticketImageData || null,
    });
    document.querySelector('.modal-overlay').remove();
    showToast(`Order ${data.order_number} created!`);
    navigate('orders', { viewId: data.id });
  } catch (err) { showToast('Failed to create order: ' + (err.response?.data?.error || err.message), 'error'); console.error('Create order error:', err.response?.data || err); }
}

// Old showEditOrderModal/submitEditOrder moved to ENHANCED ORDER EDITING section near bottom

// ==================== SCHEDULE PAGE ====================
var DAY_COLORS = ['#2563EB','#059669','#F97316','#DC2626','#7C3AED','#CA8A04'];
var DEPOT = { lat: 26.7045593, lng: -80.2047917, address: '100 Aldi Way, Ste 400, West Palm Beach, FL 33411' };

async function renderSchedule() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const today = dayjs();
  const startOfWeek = today.startOf('week').add(1, 'day');
  const days = [];
  for (let i = 0; i < 6; i++) days.push(startOfWeek.add(i, 'day'));
  const start = days[0].format('YYYY-MM-DD');
  const end = days[5].format('YYYY-MM-DD');
  const { data } = await API.get(`/schedule?start=${start}&end=${end}`);
  const ordersByDate = {};
  data.orders.forEach(o => { const d = o.scheduled_date; if (!ordersByDate[d]) ordersByDate[d] = []; ordersByDate[d].push(o); });
  const returnsByDate = {};
  (data.scheduled_returns || []).forEach(r => { const d = r.scheduled_date; if (!returnsByDate[d]) returnsByDate[d] = []; returnsByDate[d].push(r); });

  pc.innerHTML = `
    <div class="filters-bar no-print">
      <h3 style="font-weight:700;font-size:16px"><i class="fas fa-calendar-week" style="color:var(--navy-light);margin-right:8px"></i>Week of ${days[0].format('MMM D')} - ${days[5].format('MMM D, YYYY')}</h3>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" id="toggleMapBtn" onclick="toggleScheduleMap()"><i class="fas fa-map"></i> <span id="toggleMapLabel">Show Map</span></button>
        <button class="btn btn-sm" style="background:linear-gradient(135deg,#F97316,#EA580C);color:white;font-weight:700" onclick="sqBatchUpload()"><i class="fas fa-layer-group"></i> Batch Scan</button>
        <button class="btn btn-primary btn-sm" onclick="showNewOrderModal()"><i class="fas fa-plus"></i> New Order</button>
      </div>
    </div>

    <!-- MAP SECTION -->
    <div id="scheduleMapSection" class="card" style="margin-bottom:20px;display:none">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-map-marked-alt" style="color:var(--navy-light);margin-right:8px"></i>Delivery Map</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap" id="mapDayLegend"></div>
      </div>
      <div id="scheduleMap" style="height:400px;border-radius:0 0 12px 12px"></div>
    </div>

    ${data.unscheduled.length > 0 ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-inbox" style="color:var(--orange);margin-right:8px"></i>Unscheduled Orders (${data.unscheduled.length})</h3>
        <span style="font-size:12px;color:var(--gray-500)"><i class="fas fa-lightbulb" style="color:var(--orange)"></i> Click an order to see best day recommendation</span>
      </div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap">
        ${data.unscheduled.map(o => `<div class="calendar-order ${o.priority}" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"
            onclick="showScheduleRecommendation(${o.id}, '${escapeHtml(o.business_name)}', '${o.order_number}')">
          <strong>${o.order_number}</strong> - ${o.business_name} ${priorityIcon(o.priority)}
          <i class="fas fa-wand-magic-sparkles" style="color:var(--orange);font-size:10px" title="Get best day recommendation"></i>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- RECOMMENDATION PANEL -->
    <div id="recommendPanel" style="display:none;margin-bottom:20px"></div>

    <div class="calendar-grid">
      ${days.map((day, idx) => {
        const d = day.format('YYYY-MM-DD');
        const isToday = d === today.format('YYYY-MM-DD');
        const dayOrders = ordersByDate[d] || [];
        const color = DAY_COLORS[idx] || '#666';
        // Group by truck → route
        const truckGroups = {};
        const unroutedOrders = [];
        dayOrders.forEach(o => {
          if (!o.route_id) { unroutedOrders.push(o); return; }
          const tKey = o.truck_name || 'No Truck Assigned';
          const rKey = o.route_number || 'Route';
          if (!truckGroups[tKey]) truckGroups[tKey] = {};
          if (!truckGroups[tKey][rKey]) truckGroups[tKey][rKey] = { route_id: o.route_id, orders: [] };
          truckGroups[tKey][rKey].orders.push(o);
        });
        const truckNames = Object.keys(truckGroups).sort();

        function orderCard(o) {
          const sBg = o.status==='completed'?'#D1FAE5': o.status==='cancelled'?'#FEE2E2': o.status==='scheduled'?'#DBEAFE': o.status==='in_transit'?'#FEF3C7': o.status==='loaded'?'#E0E7FF':'';
          const sColor = o.status==='completed'?'#065F46': o.status==='cancelled'?'#991B1B': o.status==='scheduled'?'#1E40AF': o.status==='in_transit'?'#92400E': o.status==='loaded'?'#3730A3':'#374151';
          return `<div class="calendar-order ${o.priority}" onclick="navigate('orders',{viewId:${o.id}})" style="${sBg?'background:'+sBg+';border-color:'+sColor+'40;':''}${o.status==='cancelled'?'opacity:0.6;text-decoration:line-through;':''}padding:4px 6px;margin:2px 0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
              <span style="font-weight:600;font-size:11px">${o.order_number}</span>
              <span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${sColor}18;color:${sColor}">${o.status}</span>
            </div>
            <div style="font-size:10px;color:${sColor}">${o.business_name}</div>
          </div>`;
        }

        return `<div class="calendar-day ${isToday?'today':''}" data-date="${d}">
          <div class="calendar-date ${isToday?'today':''}" style="display:flex;align-items:center;gap:6px">
            <span class="day-color-dot" style="background:${color}"></span>
            ${day.format('ddd, MMM D')} ${isToday?'<span style="font-size:10px;background:var(--navy);color:white;padding:1px 6px;border-radius:8px;margin-left:4px">TODAY</span>':''}
          </div>
          <div style="font-size:11px;color:var(--gray-400);margin-bottom:6px">${dayOrders.length} orders</div>
          ${truckNames.map(tName => {
            const routes = truckGroups[tName];
            const rNames = Object.keys(routes).sort();
            const totalOrds = rNames.reduce((s,rn) => s + routes[rn].orders.length, 0);
            return `<div style="margin-bottom:8px">
              <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:var(--navy);background:var(--gray-100);padding:4px 6px;border-radius:4px;margin-bottom:3px;display:flex;align-items:center;gap:4px">
                <i class="fas fa-truck" style="font-size:9px;color:var(--navy-light)"></i> ${tName}
                <span style="margin-left:auto;font-size:9px;font-weight:600;color:var(--gray-500)">${totalOrds}</span>
              </div>
              ${rNames.map(rName => {
                const grp = routes[rName];
                return `<div style="margin-left:6px;margin-bottom:6px">
                  <div onclick="navigate('routes',{viewId:${grp.route_id}})" style="cursor:pointer;font-size:10px;font-weight:700;color:#1D4ED8;padding:2px 6px;border-left:3px solid #3B82F6;margin-bottom:2px;display:flex;align-items:center;gap:4px">
                    <i class="fas fa-route" style="font-size:8px"></i> ${rName}
                    <span style="font-size:9px;font-weight:600;color:var(--gray-400)">${grp.orders.length}</span>
                  </div>
                  ${grp.orders.map(o => orderCard(o)).join('')}
                </div>`;
              }).join('')}
            </div>`;
          }).join('')}
          ${unroutedOrders.length > 0 ? `<div style="margin-bottom:6px">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:var(--orange);background:#FFF7ED;padding:4px 6px;border-radius:4px;margin-bottom:3px;display:flex;align-items:center;gap:4px">
              <i class="fas fa-inbox" style="font-size:9px"></i> Unrouted
              <span style="margin-left:auto;font-size:9px;font-weight:600;color:var(--gray-500)">${unroutedOrders.length}</span>
            </div>
            ${unroutedOrders.map(o => orderCard(o)).join('')}
          </div>` : ''}
          ${(returnsByDate[d]||[]).length > 0 ? `<div style="margin-bottom:6px">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#7C3AED;background:#F5F3FF;padding:4px 6px;border-radius:4px;margin-bottom:3px;display:flex;align-items:center;gap:4px">
              <i class="fas fa-rotate-left" style="font-size:9px"></i> Returns
              <span style="margin-left:auto;font-size:9px;font-weight:600;color:var(--gray-500)">${(returnsByDate[d]||[]).length}</span>
            </div>
            ${(returnsByDate[d]||[]).map(r => {
              const itemNames = (r.items||[]).map(it => it.expected_qty + 'x ' + (it.sku||it.product_name)).join(', ');
              return `<div class="calendar-order" style="background:#F5F3FF;border-color:#C4B5FD;padding:4px 6px;margin:2px 0">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-weight:600;font-size:11px;color:#7C3AED;cursor:pointer" onclick="navigate('returns')"><i class="fas fa-rotate-left" style="font-size:9px"></i> Return #${r.id}</span>
                  <span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:#EDE9FE;color:#7C3AED">${r.status}</span>
                </div>
                <div style="font-size:10px;color:#6D28D9">${r.business_name}</div>
                ${itemNames ? `<div style="font-size:9px;color:var(--gray-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${itemNames}</div>` : ''}
                <button class="btn btn-sm" style="margin-top:3px;background:#1D4ED8;color:white;font-size:9px;padding:2px 6px;font-weight:700;width:100%" onclick="event.stopPropagation();showAddReturnToRouteModal(${r.id},'${escapeHtml(r.business_name)}')"><i class="fas fa-route"></i> Add to Route</button>
              </div>`;
            }).join('')}
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;

  // Store data for map rendering
  window._schedData = data;
  window._schedDays = days;
  window._schedOrdersByDate = ordersByDate;
  window._schedMapInit = false;
}

function toggleScheduleMap() {
  const section = document.getElementById('scheduleMapSection');
  const label = document.getElementById('toggleMapLabel');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    label.textContent = 'Hide Map';
    if (!window._schedMapInit) {
      initScheduleMap();
      window._schedMapInit = true;
    }
  } else {
    section.style.display = 'none';
    label.textContent = 'Show Map';
  }
}

async function initScheduleMap() {
  const data = window._schedData;
  const days = window._schedDays;
  const ordersByDate = window._schedOrdersByDate;
  if (!window.__gmapsLoaded) return;
  const depot = window.__DEPOT || DEPOT;
  const map = new google.maps.Map(document.getElementById('scheduleMap'), { center: { lat: depot.lat, lng: depot.lng }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
  window._schedMap = map;
  window._schedMapMarkers = [];

  // Depot marker
  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#1E3A8A', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });

  const legendEl = document.getElementById('mapDayLegend');
  let legendHtml = '';
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });

  days.forEach((day, idx) => {
    const d = day.format('YYYY-MM-DD');
    const color = DAY_COLORS[idx] || '#666';
    const dayOrders = ordersByDate[d] || [];
    legendHtml += `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:${color}18;color:${color};white-space:nowrap"><span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>${day.format('ddd')} (${dayOrders.length})</span>`;

    dayOrders.forEach(o => {
      if (!o.lat || !o.lng) return;
      bounds.extend({ lat: o.lat, lng: o.lng });
      const marker = new google.maps.Marker({ position: { lat: o.lat, lng: o.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, label: { text: day.format('dd')[0], color: '#FFFFFF', fontWeight: '700', fontSize: '10px' }, zIndex: 100 + idx });
      const iw = new google.maps.InfoWindow({ content: `<strong>${o.order_number}</strong><br>${o.business_name}<br><span style="font-size:12px;color:#666">${o.street || ''}, ${o.city || ''}</span><br>${priorityBadge(o.priority)}<br><span style="font-size:11px;color:${color};font-weight:600">${day.format('ddd, MMM D')}</span>` });
      marker.addListener('click', () => iw.open(map, marker));
      window._schedMapMarkers.push(marker);
    });
  });

  // Unscheduled as gray markers
  if (data.unscheduled) {
    data.unscheduled.forEach(o => {
      if (!o.lat || !o.lng) return;
      bounds.extend({ lat: o.lat, lng: o.lng });
      const marker = new google.maps.Marker({ position: { lat: o.lat, lng: o.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#9CA3AF', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, label: { text: '?', color: '#FFFFFF', fontWeight: '700', fontSize: '10px' }, zIndex: 50 });
      const iw = new google.maps.InfoWindow({ content: `<strong>${o.order_number}</strong> (Unscheduled)<br>${o.business_name}<br>${priorityBadge(o.priority)}` });
      marker.addListener('click', () => iw.open(map, marker));
    });
    if (data.unscheduled.length > 0) {
      legendHtml += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:#9CA3AF18;color:#6B7280"><span style="width:8px;height:8px;border-radius:50%;background:#9CA3AF"></span>Unscheduled</span>';
    }
  }

  // Overlay delivery zones as circles
  try {
    const { data: zoneData } = await API.get('/zones');
    if (zoneData.zones) {
      zoneData.zones.forEach(z => {
        if (z.center_lat && z.center_lng) {
          new google.maps.Circle({ center: { lat: z.center_lat, lng: z.center_lng }, radius: (z.radius_miles || 5) * 1609.34, strokeColor: z.color, strokeOpacity: 0.5, strokeWeight: 1.5, fillColor: z.color, fillOpacity: 0.05, map });
        }
      });
    }
  } catch (e) { /* zones not critical */ }

  legendEl.innerHTML = legendHtml;
  map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
}

// ---- Shared Best-Day recommendation renderer ----
async function renderBestDayPanel(panelId, orderId, businessName, orderNumber, onApply) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin" style="color:var(--orange)"></i> Analyzing best delivery day...</div></div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // Store callback for apply buttons
  window._bestDayApply = onApply;
  try {
    const { data } = await API.get(`/schedule/recommend?order_id=${orderId}`);
    if (!data.recommendations || data.recommendations.length === 0) {
      panel.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state" style="padding:16px"><i class="fas fa-exclamation-circle"></i><h3>No recommendations</h3></div></div></div>`;
      return;
    }
    const best = data.best_day;
    panel.innerHTML = `
      <div class="card recommend-card">
        <div class="card-header" style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE)">
          <h3 class="card-title"><i class="fas fa-lightbulb" style="color:var(--orange);margin-right:8px"></i>Best Day for ${orderNumber}${businessName ? ' - '+businessName : ''}</h3>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('${panelId}').style.display='none'"><i class="fas fa-times"></i></button>
        </div>
        <div class="card-body" style="padding:16px">
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
            ${data.recommendations.slice(0, 6).map((rec, i) => {
              const isBest = i === 0;
              const barColor = rec.score >= 70 ? 'var(--green)' : rec.score >= 40 ? 'var(--orange)' : 'var(--red)';
              return `<div class="recommend-day-card ${isBest ? 'best' : ''}" onclick="applyBestDay(${orderId}, '${rec.date}', '${orderNumber}', '${panelId}')">
                ${isBest ? '<div class="recommend-best-badge"><i class="fas fa-star"></i> BEST</div>' : ''}
                <div class="recommend-day-name">${rec.day_name}</div>
                <div class="recommend-score-bar"><div style="width:${rec.score}%;background:${barColor};height:100%;border-radius:4px;transition:width 0.5s"></div></div>
                <div class="recommend-score">${rec.score} <span style="font-size:10px;font-weight:400">/ 100</span></div>
                <div class="recommend-stats">
                  <span><i class="fas fa-box" style="color:var(--navy-light)"></i> ${rec.order_count}</span>
                  <span><i class="fas fa-pallet" style="color:var(--gray-500)"></i> ${rec.capacity_pct}% cap</span>
                </div>
                ${rec.is_zone_day ? `<div style="font-size:10px;margin-top:4px"><span style="background:var(--green);color:white;padding:1px 6px;border-radius:8px;font-weight:600"><i class="fas fa-check-circle"></i> Zone day</span></div>` : ''}
                ${rec.nearest_order ? `<div class="recommend-nearest"><i class="fas fa-map-pin" style="color:var(--green)"></i> ${rec.nearest_order.name} (${rec.nearest_order.distance_mi} mi)</div>` : ''}
                ${rec.reasons && rec.reasons.length > 0 ? `<div class="recommend-reasons">${rec.reasons.map(r => `<span class="recommend-reason">${r}</span>`).join('')}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
          ${data.warning ? `<div style="margin-top:8px;padding:6px 10px;background:#FEF3C7;border-radius:8px;border-left:3px solid #F59E0B;font-size:11px;color:#92400E">
            <i class="fas fa-exclamation-triangle" style="color:#F59E0B;margin-right:4px"></i> ${data.warning}
          </div>` : ''}
          ${data.zone ? `<div style="margin-top:8px;padding:6px 10px;background:${data.zone.color}10;border-radius:8px;border-left:3px solid ${data.zone.color};font-size:11px">
            <strong style="color:${data.zone.color}"><i class="fas fa-map-location-dot"></i> ${data.zone.name}</strong> — ${data.zone.delivery_days}
          </div>` : ''}
          <div style="margin-top:8px;font-size:11px;color:var(--gray-400);text-align:center">
            <i class="fas fa-info-circle"></i> Click a day to schedule.
          </div>
        </div>
      </div>`;

    // Show on schedule map if open
    if (window._schedMap && data.target) {
      if (window._targetMarker) window._targetMarker.setMap(null);
      if (window._targetInfoWindow) window._targetInfoWindow.close();
      window._targetMarker = new google.maps.Marker({
        position: { lat: data.target.lat, lng: data.target.lng },
        map: window._schedMap,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#F97316', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 },
        title: orderNumber, zIndex: 2000, animation: google.maps.Animation.BOUNCE
      });
      setTimeout(() => { if (window._targetMarker) window._targetMarker.setAnimation(null); }, 3000);
      window._targetInfoWindow = new google.maps.InfoWindow({ content: `<strong>${orderNumber}</strong><br>${businessName}<br><span style="color:var(--orange);font-weight:600">Best: ${best.day_name} (${best.score})</span>` });
      window._targetInfoWindow.open(window._schedMap, window._targetMarker);
      window._schedMap.setCenter({ lat: data.target.lat, lng: data.target.lng });
      window._schedMap.setZoom(13);
      const section = document.getElementById('scheduleMapSection');
      if (section && section.style.display === 'none') toggleScheduleMap();
    }
  } catch (err) {
    panel.innerHTML = `<div class="card"><div class="card-body"><div class="scan-result-banner error"><i class="fas fa-exclamation-circle"></i> ${err.message}</div></div></div>`;
  }
}

async function applyBestDay(orderId, date, orderNumber, panelId) {
  if (!confirm(`Schedule ${orderNumber} for ${date}?`)) return;
  try {
    await API.put(`/orders/${orderId}`, { scheduled_date: date, status: 'confirmed' });
    showToast(`${orderNumber} scheduled for ${date}!`);
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = 'none';
    if (window._bestDayApply) window._bestDayApply();
  } catch (err) { showToast('Failed to schedule', 'error'); }
}

async function showScheduleRecommendation(orderId, businessName, orderNumber) {
  renderBestDayPanel('recommendPanel', orderId, businessName, orderNumber, () => renderSchedule());
}

async function applyRecommendation(orderId, date, orderNumber) {
  applyBestDay(orderId, date, orderNumber, 'recommendPanel');
}

// ==================== ROUTES PAGE ====================
async function renderRoutes() {
  const pc = document.getElementById('pageContent');
  if (window._params?.viewId) { return renderRouteDetail(window._params.viewId); }
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const showArchived = _archiveToggles.routes || false;
  const { data } = await API.get('/routes' + (showArchived ? '?include_archived=1' : ''));
  const activeRoutes = data.routes.filter(r => !r.archived && r.status !== 'completed');
  const completedRoutes = data.routes.filter(r => !r.archived && r.status === 'completed');
  const archivedRoutes = data.routes.filter(r => r.archived);
  // Compute totals for summary banner
  const rtTotalItems = activeRoutes.reduce((s,r) => s + (r.total_items||0), 0);
  const rtTotalPallets = activeRoutes.reduce((s,r) => s + (r.total_pallets||0), 0);
  const rtTotalStops = activeRoutes.reduce((s,r) => s + (r.stop_count||0), 0);
  const rtTotalMiles = activeRoutes.reduce((s,r) => s + (parseFloat(r.total_miles)||0), 0);
  pc.innerHTML = `
    <div class="filters-bar no-print">
      ${archiveToggleBtn(showArchived, "toggleArchive('routes','renderRoutes')")}
      <button class="btn btn-primary" onclick="showNewRouteModal()"><i class="fas fa-plus"></i> ${t('routes_new')}</button>
      <button class="btn" style="background:linear-gradient(135deg,#4285F4,#1a73e8);color:white;font-weight:700" onclick="navigate('route_builder')"><i class="fas fa-map-location-dot"></i> Route Builder</button>
      <button class="btn" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:white;font-weight:700" onclick="showAutoPlan()"><i class="fas fa-hat-wizard"></i> Plan Tomorrow</button>
    </div>
    ${activeRoutes.length > 0 ? `<div style="display:flex;gap:16px;flex-wrap:wrap;padding:12px 16px;margin-bottom:12px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:12px;border:1px solid #93C5FD">
      <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-route" style="color:#2563EB;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${activeRoutes.length}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Routes</div></div></div>
      <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-boxes-stacked" style="color:#D97706;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${rtTotalItems}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Total Units</div></div></div>
      <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-pallet" style="color:#7C3AED;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${rtTotalPallets}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Pallets</div></div></div>
      <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-map-pin" style="color:#059669;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${rtTotalStops}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Stops</div></div></div>
      <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-road" style="color:#DC2626;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${Math.round(rtTotalMiles)}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Miles</div></div></div>
    </div>` : ''}
    <div class="card">
      <div class="table-container">
        <table><thead><tr><th>Route</th><th>${t('common_date')}</th><th>${t('packing_driver')}</th><th>${t('packing_truck')}</th><th>${t('route_stops')}</th><th>Items/Pallets</th><th>Miles</th><th>${t('common_status')}</th></tr></thead>
        <tbody>
          ${activeRoutes.map(r => `<tr onclick="navigate('routes',{viewId:${r.id}})">
            <td><strong style="color:var(--navy)">${r.route_number||'—'}</strong></td>
            <td>${formatDate(r.date)}</td>
            <td><i class="fas fa-user" style="color:var(--gray-400);margin-right:4px"></i>${r.driver_name||'Unassigned'}</td>
            <td><i class="fas fa-truck" style="color:var(--gray-400);margin-right:4px"></i>${r.truck_name||'—'}</td>
            <td>${r.stop_count}</td>
            <td><strong>${r.total_items||0}</strong> units / <strong>${r.total_pallets||0}</strong>p</td>
            <td>${r.total_miles||'-'} mi</td>
            <td>${routeStatusBadge(r.status)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
      ${activeRoutes.length===0?'<div class="empty-state"><i class="fas fa-route"></i><h3>No active routes</h3><p>Create a new route to get started</p></div>':''}
    </div>
    ${completedRoutes.length > 0 ? `<div class="card" style="margin-top:16px">
      <div class="card-header" style="cursor:pointer;user-select:none" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.section-chevron').classList.toggle('fa-chevron-down');this.querySelector('.section-chevron').classList.toggle('fa-chevron-right')">
        <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
          <i class="fas fa-check-circle" style="color:#059669"></i> Completed
          <span class="badge" style="background:#D1FAE5;color:#059669;font-size:12px">${completedRoutes.length}</span>
        </h3>
        <i class="fas fa-chevron-right section-chevron" style="color:var(--gray-400);font-size:12px"></i>
      </div>
      <div class="table-container" style="display:none">
        <table><thead><tr><th>Route</th><th>${t('common_date')}</th><th>${t('packing_driver')}</th><th>${t('packing_truck')}</th><th>${t('route_stops')}</th><th>Items/Pallets</th><th>Miles</th><th>${t('common_status')}</th></tr></thead>
        <tbody>${completedRoutes.map(r => `<tr style="opacity:0.7" onclick="navigate('routes',{viewId:${r.id}})">
          <td><strong style="color:var(--navy)">${r.route_number||'—'}</strong></td>
          <td>${formatDate(r.date)}</td>
          <td><i class="fas fa-user" style="color:var(--gray-400);margin-right:4px"></i>${r.driver_name||'Unassigned'}</td>
          <td><i class="fas fa-truck" style="color:var(--gray-400);margin-right:4px"></i>${r.truck_name||'—'}</td>
          <td>${r.stop_count}</td>
          <td><strong>${r.total_items||0}</strong> units / <strong>${r.total_pallets||0}</strong>p</td>
          <td>${r.total_miles||'-'} mi</td>
          <td>${routeStatusBadge(r.status)}</td>
        </tr>`).join('')}</tbody></table>
      </div>
    </div>` : ''}
    ${showArchived && archivedRoutes.length > 0 ? `<div class="card" style="margin-top:16px">
      <div class="card-header" style="cursor:pointer;user-select:none;background:#FEF2F2" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.section-chevron').classList.toggle('fa-chevron-down');this.querySelector('.section-chevron').classList.toggle('fa-chevron-right')">
        <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
          <i class="fas fa-archive" style="color:#991B1B"></i> ${t('archive_section')}
          <span class="badge" style="background:#FEE2E2;color:#991B1B;font-size:12px">${archivedRoutes.length}</span>
        </h3>
        <i class="fas fa-chevron-right section-chevron" style="color:var(--gray-400);font-size:12px"></i>
      </div>
      <div class="table-container" style="display:none">
        <table><thead><tr><th>Route</th><th>${t('common_date')}</th><th>${t('packing_driver')}</th><th>${t('packing_truck')}</th><th>${t('route_stops')}</th><th>Items/Pallets</th><th>Miles</th><th>${t('common_status')}</th></tr></thead>
        <tbody>${archivedRoutes.map(r => `<tr style="opacity:0.5" onclick="navigate('routes',{viewId:${r.id}})">
          <td><strong style="color:var(--navy)">${r.route_number||'—'}</strong>${archiveBadge()}</td>
          <td>${formatDate(r.date)}</td>
          <td><i class="fas fa-user" style="color:var(--gray-400);margin-right:4px"></i>${r.driver_name||'Unassigned'}</td>
          <td><i class="fas fa-truck" style="color:var(--gray-400);margin-right:4px"></i>${r.truck_name||'—'}</td>
          <td>${r.stop_count}</td>
          <td><strong>${r.total_items||0}</strong> units / <strong>${r.total_pallets||0}</strong>p</td>
          <td>${r.total_miles||'-'} mi</td>
          <td>${routeStatusBadge(r.status)}</td>
        </tr>`).join('')}</tbody></table>
      </div>
    </div>` : ''}`;
}

async function renderRouteDetail(id) {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
  const [routeRes, analyticsRes] = await Promise.all([
    API.get(`/routes/${id}`),
    API.get(`/routes/${id}/analytics`).catch(() => ({ data: null }))
  ]);
  const r = routeRes.data.route; const stops = routeRes.data.stops;
  const totals = routeRes.data.totals || { items: 0, pallets: 0 };
  const a = analyticsRes.data;
  const completedStops = stops.filter(s => s.status === 'completed').length;
  const pct = stops.length > 0 ? Math.round((completedStops / stops.length) * 100) : 0;
  window._currentRouteId = id;
  window._routeDetailStops = stops;
  window._routeDetailRoute = r;
  window._routeDetailMapInit = false;

  const routeStatuses = ['planned','pending_loading','loaded','truck_left','dispatched','completed'];
  const routeStatusOptions = routeStatuses.map(s => `<option value="${s}" ${r.status===s?'selected':''}>${routeStatusLabel(s)}</option>`).join('');

  pc.innerHTML = `
    <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-outline" onclick="navigate('routes')"><i class="fas fa-arrow-left"></i> ${t('routes_title')}</button>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" style="color:#7C3AED;border-color:#7C3AED" onclick="showReturnModal(null, ${id})"><i class="fas fa-rotate-left"></i> Log Return</button>
        <button class="btn btn-primary btn-sm" onclick="optimizeRoute(${id})"><i class="fas fa-magic"></i> ${t('route_optimize')}</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('packing',{routeId:${id}})"><i class="fas fa-print"></i> ${t('packing_title')}</button>
        ${archiveActionBtn('routes', id, r.archived, 'renderRoutes')}
      </div>
    </div>

    <!-- Route Info Header -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <h3 class="card-title" style="font-size:20px;cursor:pointer" onclick="showRenameRouteModal(${id},'${escapeHtml(r.route_number||'')}')" title="Click to rename">${r.route_number||'Route'} <i class="fas fa-pen" style="font-size:11px;color:var(--gray-400)"></i></h3>
          <span style="color:var(--gray-500);font-size:13px;cursor:pointer" onclick="showChangeDateModal(${id},'${r.date||''}')" title="Click to change date">${formatDate(r.date)} <i class="fas fa-pen" style="font-size:10px;color:var(--gray-400)"></i></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${routeStatusBadge(r.status)}
          <select class="form-select" style="width:auto;font-size:12px;padding:4px 8px;border-radius:8px;font-weight:600" onchange="updateRouteStatus(${id},this.value)">
            ${routeStatusOptions}
          </select>
        </div>
      </div>
      <div class="card-body">
        <!-- Totals banner -->
        <div style="display:flex;gap:16px;flex-wrap:wrap;padding:10px 14px;margin-bottom:14px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:10px;border:1px solid #93C5FD">
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-boxes-stacked" style="color:#2563EB;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${totals.items}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Total Units</div></div></div>
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-pallet" style="color:#D97706;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${totals.pallets}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Pallets</div></div></div>
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-map-pin" style="color:#059669;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${stops.length}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Stops</div></div></div>
          ${a ? `<div style="display:flex;align-items:center;gap:6px"><i class="fas fa-road" style="color:var(--navy-light);font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${a.total_miles}</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Miles</div></div></div>
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-gas-pump" style="color:#DC2626;font-size:16px"></i><div><div style="font-size:20px;font-weight:800;color:var(--navy)">${a.fuel_estimate.gallons}g</div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">~$${a.fuel_estimate.cost}</div></div></div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px">
          <div>
            <div class="form-label" style="display:flex;justify-content:space-between;align-items:center">${t('packing_driver')}
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="showAssignDriverToRoute(${id},${r.driver_id||'null'})"><i class="fas fa-pen"></i> ${r.driver_name ? t('route_change_driver') : t('route_assign_driver')}</button>
            </div>
            <strong>${r.driver_name||'<span style="color:var(--orange)">Unassigned</span>'}</strong>${r.driver_phone?`<div style="font-size:12px;color:var(--gray-500)">${r.driver_phone}</div>`:''}
          </div>
          <div>
            <div class="form-label" style="display:flex;justify-content:space-between;align-items:center">${t('packing_truck')}
              <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="showAssignTruckToRoute(${id},${r.truck_id||'null'},${r.driver_id||'null'})"><i class="fas fa-pen"></i> ${r.truck_name ? t('route_change_truck') : t('route_assign_truck')}</button>
            </div>
            <strong>${r.truck_name||'<span style="color:var(--orange)">—</span>'}</strong>${r.plate_number?`<div style="font-size:12px;color:var(--gray-500)">${r.plate_number}</div>`:''}
          </div>
          <div><div class="form-label">Pallet Capacity</div><strong>${r.max_pallet_spots||12} pallets</strong>
            <div class="weight-bar" style="width:100px"><div class="weight-bar-fill ${Math.round(totals.pallets/(r.max_pallet_spots||12)*100)>90?'danger':Math.round(totals.pallets/(r.max_pallet_spots||12)*100)>70?'warning':'safe'}" style="width:${Math.min(Math.round(totals.pallets/(r.max_pallet_spots||12)*100),100)}%"></div></div>
          </div>
          <div><div class="form-label">${t('route_progress')}</div><strong>${completedStops}/${stops.length}</strong>
            <div class="weight-bar" style="width:100px"><div class="weight-bar-fill safe" style="width:${pct}%"></div></div></div>
        </div>
      </div>
    </div>

    <!-- ROUTE MAP - always visible -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-map-marked-alt" style="color:var(--navy-light);margin-right:8px"></i>${t('route_map')}</h3>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-outline btn-sm" id="btnOpenGoogleMaps" onclick="openRouteInGoogleMaps()" title="Open full route in Google Maps" style="color:#4285F4;border-color:#4285F4"><i class="fab fa-google"></i> Open in Google Maps</button>
          <button class="btn btn-outline btn-sm map-layer-btn active" id="mapLayerStreet" onclick="switchMapLayer('street')" title="Street"><i class="fas fa-road"></i></button>
          <button class="btn btn-outline btn-sm map-layer-btn" id="mapLayerSat" onclick="switchMapLayer('satellite')" title="Satellite"><i class="fas fa-satellite"></i></button>
          <button class="btn btn-outline btn-sm map-layer-btn" id="mapLayerHybrid" onclick="switchMapLayer('hybrid')" title="Hybrid"><i class="fas fa-layer-group"></i></button>
        </div>
      </div>
      <div id="routeDetailMap" style="height:450px;border-radius:0 0 12px 12px"></div>
      <div id="routeDirectionsInfo" style="display:none;padding:12px 16px;background:#F0F7FF;border-top:1px solid #DBEAFE;border-radius:0 0 12px 12px;font-size:13px;color:#1E3A8A"></div>
      <div id="routeMapSidebar" style="display:none;position:absolute;right:10px;top:60px;z-index:1000;width:300px;max-height:380px;overflow-y:auto;background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:12px"></div>
    </div>

    <!-- Optimization results banner -->
    <div id="optimizeResultBanner" style="display:none;margin-bottom:16px"></div>

    <!-- Stops Table with reorder and notes -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${t('route_stops')} (${stops.length}) — ${totals.items} units, ${totals.pallets} pallets</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="showAddStopModal(${id})"><i class="fas fa-plus"></i> ${t('route_add_stop')}</button>
        </div>
      </div>
      <div class="table-container">
        <table id="stopsTable"><thead><tr><th style="width:60px">#</th><th>${t('dash_order')}</th><th>${t('dash_customer')}</th><th>Items</th><th>${t('orders_address')}</th><th>${t('route_leg')}</th><th>${t('route_notes')}</th><th>${t('dash_status')}</th><th style="width:80px"></th></tr></thead>
        <tbody id="stopsTableBody">${stops.map((s, i) => {
          const leg = a?.legs?.find(l => l.stop_id === s.id);
          const itemList = (s.items||[]).map(it => `${it.quantity}x ${it.sku||it.product_name}`).join(', ');
          const isReturn = !!s.is_return;
          const chgs = s.changes || [];
          const chgMap = {};
          chgs.forEach(ch => { chgMap[ch.product_id] = ch; });
          // Build change summary pills
          const changePills = [];
          chgs.filter(c => c.type==='qty_changed').forEach(c => { changePills.push(`<span style="display:inline-block;font-size:10px;background:#FFFBEB;border:1px solid #F59E0B;color:#92400E;padding:1px 5px;border-radius:3px;font-weight:700;margin:1px">${c.sku||c.name}: ${c.old_quantity}→${c.quantity}</span>`); });
          chgs.filter(c => c.type==='added').forEach(c => { changePills.push(`<span style="display:inline-block;font-size:10px;background:#DCFCE7;border:1px solid #86EFAC;color:#166534;padding:1px 5px;border-radius:3px;font-weight:700;margin:1px">+${c.name}</span>`); });
          chgs.filter(c => c.type==='removed').forEach(c => { changePills.push(`<span style="display:inline-block;font-size:10px;background:#FEE2E2;border:1px solid #FCA5A5;color:#991B1B;padding:1px 5px;border-radius:3px;font-weight:700;margin:1px;text-decoration:line-through">-${c.name}</span>`); });
          if (s.instructions_changed) changePills.push(`<span style="display:inline-block;font-size:10px;background:#FFFBEB;border:1px solid #F59E0B;color:#92400E;padding:1px 5px;border-radius:3px;font-weight:700;margin:1px"><i class="fas fa-pen" style="font-size:8px"></i> instructions</span>`);
          // Return items show reason instead of quantity format
          const returnItemList = isReturn ? (s.items||[]).map(it => `${it.quantity}x ${it.sku||it.product_name}${it.reason?' ('+it.reason.replace(/_/g,' ')+')':''}`).join(', ') : '';
          const seqBg = isReturn ? 'linear-gradient(135deg,#7C3AED,#5B21B6)' : (s.status==='completed'?'var(--green)':'var(--navy)');
          const canDrag = s.status === 'pending';
          return `<tr id="stop-row-${s.id}" data-stop-id="${s.id}" class="${s.status==='completed'?'stop-completed':''}" style="${isReturn?'background:#FAF5FF;':''}" ${canDrag ? 'draggable="true"' : ''}>
          <td>
            <div style="display:flex;align-items:center;gap:4px">
              ${canDrag ? `<span class="drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>` : '<span style="width:18px"></span>'}
              <span class="stop-number" style="width:28px;height:28px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:${seqBg};color:white">${isReturn?'<i class="fas fa-rotate-left" style="font-size:10px"></i>':s.sequence}</span>
            </div>
          </td>
          <td ${isReturn?`onclick="navigate('returns')" style="cursor:pointer"`:`onclick="navigate('orders',{viewId:${s.order_id}})" style="cursor:pointer"`}>
            ${isReturn ? `<strong style="color:#7C3AED"><i class="fas fa-rotate-left" style="font-size:10px"></i> Return #${s.return_id}</strong>
              <span class="badge" style="background:#EDE9FE;color:#7C3AED;font-size:9px;margin-left:4px">PICKUP</span>` 
            : `<strong style="color:var(--navy)">${s.order_number}</strong>`}
          </td>
          <td>${s.business_name}</td>
          <td style="font-size:11px;max-width:220px">
            ${isReturn ? `<div style="font-weight:700;color:#7C3AED">${s.item_count||0} units to pick up</div>
              <div style="color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(returnItemList)}">${returnItemList||'—'}</div>` 
            : `<div style="font-weight:700;color:var(--navy);display:flex;align-items:center;gap:4px">
                ${s.item_count||0} units / <span id="pallet-display-${s.id}" class="pallet-editable" onclick="event.stopPropagation();editStopPallets(${s.id}, ${s.order_id}, ${s.pallet_count||0}, ${s.actual_pallets||0}, ${s.pallets_corrected||0}, ${id})" style="cursor:pointer;padding:1px 5px;border-radius:4px;${s.pallets_corrected ? 'background:#FEF3C7;color:#92400E;border:1px dashed #D97706' : 'border:1px solid transparent'}" title="${s.pallets_corrected ? 'Corrected from '+s.pallet_count+'p → click to edit' : 'Click to correct pallet count'}">${s.pallets_corrected ? (s.actual_pallets||s.pallet_count||0) : (s.pallet_count||0)}p</span>
                ${s.pallets_corrected ? '<i class="fas fa-user-check" style="font-size:9px;color:#D97706" title="Manually corrected"></i>' : '<i class="fas fa-pen" style="font-size:8px;color:var(--gray-400)" title="Click to correct"></i>'}
              </div>
              <div style="color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(itemList)}">${itemList||'—'}</div>
              ${changePills.length > 0 ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:2px">${changePills.join('')}</div>` : ''}`}
          </td>
          <td style="font-size:12px">${s.street||''}, ${s.city||''} ${s.zip||''} ${s.gate_code?`<div style="color:var(--orange);font-size:11px"><i class="fas fa-key"></i> ${s.gate_code}</div>`:''}</td>
          <td style="font-size:12px;color:var(--gray-500)">${leg ? `${leg.distance_mi} mi<br><span style="font-size:10px">${leg.cumulative_mi} mi total</span>` : '-'}</td>
          <td>
            <div class="stop-note-cell" onclick="event.stopPropagation();editStopNote(${s.id},'${escapeHtml(s.notes||'')}')">
              ${s.notes ? `<span style="font-size:12px;color:var(--gray-600)"><i class="fas fa-sticky-note" style="color:var(--orange)"></i> ${escapeHtml(s.notes).substring(0,30)}${s.notes.length>30?'...':''}</span>` 
              : `<span style="font-size:11px;color:var(--gray-400);cursor:pointer"><i class="fas fa-plus-circle"></i> ${t('route_add_note')}</span>`}
            </div>
            ${!isReturn && s.instructions_changed ? `<div style="font-size:11px;color:#D97706;margin-top:2px;font-weight:700"><i class="fas fa-pen"></i> Instructions updated</div>` : !isReturn && s.special_instructions ? `<div style="font-size:11px;color:var(--orange);margin-top:2px"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(s.special_instructions).substring(0,30)}...</div>` : ''}
            ${isReturn && s.special_instructions ? `<div style="font-size:11px;color:#7C3AED;margin-top:2px"><i class="fas fa-sticky-note"></i> ${escapeHtml(s.special_instructions).substring(0,40)}</div>` : ''}
          </td>
          <td>${isReturn ? `<span class="badge" style="background:#EDE9FE;color:#7C3AED">${s.return_status||s.status}</span>` : statusBadge(s.status)}</td>
          <td>
            <div style="display:flex;gap:3px;flex-wrap:wrap">
              ${isReturn ? '' : `<button class="btn-icon" onclick="event.stopPropagation();showEditOrderModal(${s.order_id})" title="Edit order"><i class="fas fa-pen" style="color:var(--navy-light)"></i></button>
              <button class="btn-icon" onclick="event.stopPropagation();showReturnModal(${s.order_id}, ${id}, ${s.customer_id})" title="Log return"><i class="fas fa-rotate-left" style="color:#7C3AED"></i></button>`}
              <button class="btn-icon" onclick="event.stopPropagation();focusStopOnMap(${s.id})" title="${t('route_view_property')}"><i class="fas fa-satellite" style="color:var(--gray-400)"></i></button>
              ${s.status === 'pending' ? `<button class="btn-icon" onclick="event.stopPropagation();removeStopFromRoute(${id},${s.id},'${escapeHtml(s.business_name)}')" title="${t('route_remove_stop')}"><i class="fas fa-times" style="color:var(--red)"></i></button>` : ''}
            </div>
          </td>
        </tr>`;}).join('')}</tbody></table>
      </div>
    </div>`;

  // Init map immediately
  setTimeout(() => initRouteDetailMap(), 100);
  // Init drag-and-drop reordering for stops
  setTimeout(() => initStopsDragDrop(id), 150);
  } catch(err) {
    console.error('renderRouteDetail error:', err);
    pc.innerHTML = `<div class="card" style="padding:40px;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i><h3>Route Load Error</h3><p style="color:red;font-family:monospace;font-size:12px;margin:12px 0;text-align:left;white-space:pre-wrap;background:#FEE2E2;padding:12px;border-radius:8px">${String(err.message||err).replace(/</g,'&lt;')}</p><button class="btn btn-primary" onclick="navigate('routes')"><i class="fas fa-arrow-left"></i> Back to Routes</button></div>`;
  }
}

// ==================== DRAG-AND-DROP STOP REORDERING ====================
function initStopsDragDrop(routeId) {
  const tbody = document.getElementById('stopsTableBody');
  if (!tbody) return;
  let draggedRow = null;
  let dragSrcIndex = -1;

  const draggableRows = tbody.querySelectorAll('tr[draggable="true"]');
  if (draggableRows.length < 2) return; // Need at least 2 to reorder

  draggableRows.forEach(row => {
    // Make the drag handle the actual draggable element via mousedown
    const handle = row.querySelector('.drag-handle');
    if (!handle) return;

    // Prevent row dragging unless started from handle
    let handleGrabbed = false;
    handle.addEventListener('mousedown', () => { handleGrabbed = true; });
    handle.addEventListener('touchstart', () => { handleGrabbed = true; }, { passive: true });
    document.addEventListener('mouseup', () => { handleGrabbed = false; });
    document.addEventListener('touchend', () => { handleGrabbed = false; });

    row.addEventListener('dragstart', (e) => {
      if (!handleGrabbed) { e.preventDefault(); return; }
      draggedRow = row;
      dragSrcIndex = [...tbody.children].indexOf(row);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.stopId);
      // Use timeout so the browser captures the row image before we ghost it
      setTimeout(() => { row.classList.add('dragging'); }, 0);
    });

    row.addEventListener('dragend', () => {
      if (draggedRow) draggedRow.classList.remove('dragging');
      draggedRow = null;
      handleGrabbed = false;
      clearHighlights();
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedRow || draggedRow === row) return;
      e.dataTransfer.dropEffect = 'move';
      // Clear all highlights first, then set the correct one
      clearHighlights();
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      row.classList.add(e.clientY < midY ? 'drag-over-above' : 'drag-over-below');
    });

    row.addEventListener('dragleave', (e) => {
      // Only clear if leaving the row entirely (not entering a child element)
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('drag-over-above', 'drag-over-below');
      }
    });

    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedRow || draggedRow === row) return;
      clearHighlights();
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) { tbody.insertBefore(draggedRow, row); }
      else { tbody.insertBefore(draggedRow, row.nextSibling); }
      draggedRow.classList.remove('dragging');
      await saveDragOrder(routeId);
      draggedRow = null;
    });
  });

  // Also handle drop on the tbody itself (edge case: dropping below last row)
  tbody.addEventListener('dragover', (e) => { if (draggedRow) e.preventDefault(); });
  tbody.addEventListener('drop', async (e) => {
    if (!draggedRow) return;
    e.preventDefault();
    clearHighlights();
    // If drop was on tbody but not a row, already handled by row drop
  });

  // --- Touch fallback ---
  let touchRow = null, touchClone = null, touchTarget = null, touchScrollTimer = null;

  draggableRows.forEach(row => {
    const handle = row.querySelector('.drag-handle');
    if (!handle) return;

    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchRow = row;
      row.classList.add('dragging');
      touchClone = document.createElement('div');
      touchClone.innerHTML = `<div style="padding:8px 16px;background:white;border:2px solid #2563EB;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-size:13px;font-weight:700;color:var(--navy);white-space:nowrap">${row.querySelector('strong')?.textContent || 'Stop'} — ${row.querySelector('td:nth-child(3)')?.textContent?.trim() || ''}</div>`;
      touchClone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;left:20px;top:${e.touches[0].clientY - 20}px;`;
      document.body.appendChild(touchClone);
    }, { passive: false });

    handle.addEventListener('touchmove', (e) => {
      if (!touchRow) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      if (touchClone) touchClone.style.top = (y - 20) + 'px';
      clearHighlights();
      clearInterval(touchScrollTimer);
      if (y < 100) touchScrollTimer = setInterval(() => window.scrollBy(0, -6), 16);
      else if (y > window.innerHeight - 100) touchScrollTimer = setInterval(() => window.scrollBy(0, 6), 16);
      const target = document.elementFromPoint(e.touches[0].clientX, y)?.closest('tr[data-stop-id]');
      if (target && target !== touchRow && target.hasAttribute('draggable')) {
        const rect = target.getBoundingClientRect();
        target.classList.add(y < rect.top + rect.height / 2 ? 'drag-over-above' : 'drag-over-below');
        touchTarget = target;
      } else { touchTarget = null; }
    }, { passive: false });

    handle.addEventListener('touchend', async () => {
      clearInterval(touchScrollTimer);
      if (touchClone) { touchClone.remove(); touchClone = null; }
      if (!touchRow) return;
      touchRow.classList.remove('dragging');
      if (touchTarget && touchTarget !== touchRow) {
        const above = touchTarget.classList.contains('drag-over-above');
        if (above) tbody.insertBefore(touchRow, touchTarget);
        else tbody.insertBefore(touchRow, touchTarget.nextSibling);
        clearHighlights();
        await saveDragOrder(routeId);
      } else { clearHighlights(); }
      touchRow = null; touchTarget = null;
    });
  });

  function clearHighlights() {
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));
  }

  async function saveDragOrder(routeId) {
    const newOrder = [...tbody.querySelectorAll('tr[data-stop-id]')].map(r => parseInt(r.dataset.stopId));
    try {
      await API.put(`/routes/${routeId}/reorder`, { stop_order: newOrder });
      showToast(t('route_reordered'));
      renderRouteDetail(routeId);
    } catch (err) {
      showToast('Failed to reorder', 'error');
      renderRouteDetail(routeId);
    }
  }
}

// ==================== MAP LAYER SWITCHING ====================
function switchMapLayer(type) {
  // Google Maps route detail map
  if (window._gmap) {
    document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
    if (type === 'satellite') {
      window._gmap.setMapTypeId(google.maps.MapTypeId.SATELLITE);
      document.getElementById('mapLayerSat')?.classList.add('active');
    } else if (type === 'hybrid') {
      window._gmap.setMapTypeId(google.maps.MapTypeId.HYBRID);
      document.getElementById('mapLayerHybrid')?.classList.add('active');
    } else {
      window._gmap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
      document.getElementById('mapLayerStreet')?.classList.add('active');
    }
    return;
  }

}

// ==================== OPEN FULL ROUTE IN GOOGLE MAPS ====================
function openRouteInGoogleMaps() {
  const stops = (window._routeDetailStops || []).filter(s => s.lat && s.lng);
  if (stops.length === 0) return;
  const depot = window.__DEPOT || DEPOT;
  const origin = `${depot.lat},${depot.lng}`;
  // Google Maps supports up to ~10 waypoints in the URL
  // Last stop = destination, others = waypoints
  const waypointStops = stops.slice(0, stops.length - 1);
  const destination = stops.length > 0 ? `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}` : origin;
  let url = `https://www.google.com/maps/dir/${encodeURIComponent(depot.address || origin)}`;
  for (const s of stops) {
    url += `/${s.lat},${s.lng}`;
  }
  // Return to depot
  url += `/${encodeURIComponent(depot.address || origin)}`;
  window.open(url, '_blank');
}

// ==================== ROUTE MAP INITIALIZATION (GOOGLE MAPS) ====================
function initRouteDetailMap() {
  const stops = window._routeDetailStops || [];
  const container = document.getElementById('routeDetailMap');
  if (!container) return;

  // If Google Maps not loaded, abort
  if (!window.__gmapsLoaded || !window.google?.maps) {
    console.warn('Google Maps not loaded yet'); return;
  }

  // Clean up previous
  if (window._gmap) { window._gmap = null; }
  window._routeMarkers = {};
  window._gmapInfoWindows = [];

  const depot = window.__DEPOT || DEPOT;
  const geocodedStops = stops.filter(s => s.lat && s.lng);

  // Create Google Map
  const map = new google.maps.Map(container, {
    center: { lat: depot.lat, lng: depot.lng },
    zoom: 12,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true
  });
  window._gmap = map;

  // Depot marker
  const depotMarker = new google.maps.Marker({
    position: { lat: depot.lat, lng: depot.lng },
    map: map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: '#1E3A8A',
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 3
    },
    label: { text: '\uf494', fontFamily: 'Font Awesome 6 Free', fontWeight: '900', color: '#FFFFFF', fontSize: '12px' },
    title: 'BF Distribution Center',
    zIndex: 1000
  });
  const depotInfo = new google.maps.InfoWindow({
    content: '<div style="padding:4px"><strong>BF Distribution Center</strong><br>100 Aldi Way, Ste 400, West Palm Beach, FL 33411<br><em style="color:#666">Start / End Point</em></div>'
  });
  depotMarker.addListener('click', () => { closeAllInfoWindows(); depotInfo.open(map, depotMarker); });
  window._gmapInfoWindows.push(depotInfo);

  // Stop markers (custom numbered)
  geocodedStops.forEach((s, i) => {
    const isDone = s.status === 'completed';
    const isFailed = s.status === 'failed';
    const isReturn = !!s.is_return;
    const bgColor = isDone ? '#059669' : isFailed ? '#DC2626' : isReturn ? '#7C3AED' : '#F97316';

    const marker = new google.maps.Marker({
      position: { lat: s.lat, lng: s.lng },
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: bgColor,
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 3
      },
      label: { text: String(s.sequence), color: '#FFFFFF', fontWeight: '700', fontSize: '12px' },
      title: `Stop #${s.sequence}: ${s.business_name}`,
      zIndex: 100 + i
    });

    const infoContent = `
      <div style="min-width:240px;font-family:Inter,sans-serif">
        <strong style="font-size:14px;color:#1E3A8A">Stop #${s.sequence}: ${escapeHtml(s.business_name)}</strong><br>
        <span style="color:#666;font-size:12px">${s.order_number || ''}</span><br>
        <span style="font-size:12px">${s.street || ''}, ${s.city || ''} ${s.zip || ''}</span><br>
        ${s.gate_code ? `<span style="color:#F97316;font-size:12px"><b>Gate:</b> ${s.gate_code}</span><br>` : ''}
        ${s.special_instructions ? `<div style="margin-top:4px;padding:4px 6px;background:#FEF3C7;border-radius:4px;font-size:11px;color:#92400E"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(s.special_instructions).substring(0, 80)}</div>` : ''}
        ${s.notes ? `<div style="margin-top:3px;font-size:11px;color:#666"><i class="fas fa-sticky-note" style="color:#F97316"></i> ${escapeHtml(s.notes)}</div>` : ''}
        <div style="margin-top:8px;display:flex;gap:6px">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" style="font-size:11px;color:#2563EB;text-decoration:none"><i class="fas fa-directions"></i> Navigate</a>
          <span style="color:#ccc">|</span>
          <a href="#" onclick="event.preventDefault();focusStopOnMap(${s.id})" style="font-size:11px;color:#059669;text-decoration:none"><i class="fas fa-satellite"></i> Satellite</a>
        </div>
      </div>`;
    const infoWindow = new google.maps.InfoWindow({ content: infoContent });
    marker.addListener('click', () => {
      closeAllInfoWindows();
      infoWindow.open(map, marker);
      highlightStopRow(s.id);
    });
    window._gmapInfoWindows.push(infoWindow);
    window._routeMarkers[s.id] = { marker, infoWindow };
  });

  // Request real road directions from backend
  if (geocodedStops.length > 0) {
    fetchAndDrawDirections(map, depot, geocodedStops);
  } else {
    // No geocoded stops — just show depot
    map.setZoom(12);
  }

  window._routeDetailMapInit = true;
}

function closeAllInfoWindows() {
  (window._gmapInfoWindows || []).forEach(iw => iw.close());
}

function highlightStopRow(stopId) {
  document.querySelectorAll('tr[id^="stop-row-"]').forEach(r => r.style.background = '');
  const row = document.getElementById(`stop-row-${stopId}`);
  if (row) { row.style.background = '#EFF6FF'; row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// Fetch directions from backend and draw on Google Map
async function fetchAndDrawDirections(map, depot, geocodedStops) {
  const infoDiv = document.getElementById('routeDirectionsInfo');
  if (infoDiv) {
    infoDiv.style.display = 'block';
    infoDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating road directions...';
  }

  const origin = `${depot.lat},${depot.lng}`;
  const destination = origin; // Return to depot
  const waypoints = geocodedStops.map(s => `${s.lat},${s.lng}`);

  try {
    const { data } = await API.post('/maps/directions', { origin, destination, waypoints });

    if (data.status === 'OK' && data.overview_polyline) {
      // Decode polyline and draw on map
      const path = google.maps.geometry.encoding.decodePath(data.overview_polyline);
      if (window._directionsPolyline) window._directionsPolyline.setMap(null);
      window._directionsPolyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#4285F4',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: map
      });

      // Fit bounds to the route
      if (data.bounds) {
        map.fitBounds({
          south: data.bounds.southwest.lat,
          west: data.bounds.southwest.lng,
          north: data.bounds.northeast.lat,
          east: data.bounds.northeast.lng
        }, { top: 40, bottom: 40, left: 40, right: 40 });
      }

      // Show directions summary
      if (infoDiv) {
        const legSummary = (data.legs || []).map((leg, i) => {
          const stopName = i < geocodedStops.length ? geocodedStops[i].business_name : 'BF Distribution';
          return `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:12px"><span style="background:#F97316;color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${i + 1}</span><span style="font-size:11px">${leg.distance?.text || ''}</span></span>`;
        }).join('');

        infoDiv.innerHTML = `
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px">
              <i class="fas fa-road" style="color:#4285F4;font-size:16px"></i>
              <strong style="font-size:16px">${data.total_distance?.text || '?'}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <i class="fas fa-clock" style="color:#059669;font-size:16px"></i>
              <strong style="font-size:16px">${data.total_duration?.text || '?'}</strong>
              <span style="font-size:11px;color:#666">(drive time)</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <i class="fas fa-gas-pump" style="color:#DC2626;font-size:14px"></i>
              <span style="font-size:13px">~${((data.total_distance?.miles || 0) / 8).toFixed(1)} gal (~$${(((data.total_distance?.miles || 0) / 8) * 4.2).toFixed(2)})</span>
            </div>
          </div>
          ${data.warnings?.length ? `<div style="margin-top:6px;font-size:11px;color:#D97706"><i class="fas fa-exclamation-triangle"></i> ${data.warnings.join('; ')}</div>` : ''}
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;align-items:center;gap:2px">
            <span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px"><span style="background:#1E3A8A;color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px"><i class="fas fa-warehouse" style="font-size:8px"></i></span></span>
            ${legSummary}
            <span style="display:inline-flex;align-items:center;gap:3px"><span style="background:#1E3A8A;color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:8px"><i class="fas fa-warehouse"></i></span><span style="font-size:11px">Return</span></span>
          </div>`;
      }

      // Store directions data for route analytics
      window._routeDirectionsData = data;

    } else {
      throw new Error(data.error || 'Directions failed');
    }
  } catch (err) {
    console.warn('Google Directions failed, falling back to straight lines:', err);
    if (infoDiv) {
      infoDiv.innerHTML = `<span style="color:#D97706"><i class="fas fa-exclamation-triangle"></i> Road directions unavailable — showing straight-line route. ${err.response?.data?.detail || err.message || ''}</span>`;
    }
    // Draw straight-line fallback
    drawStraightLineRoute(map, depot, geocodedStops);
  }
}

// Straight-line fallback (when Directions API fails)
function drawStraightLineRoute(map, depot, geocodedStops) {
  const coords = [{ lat: depot.lat, lng: depot.lng }];
  geocodedStops.forEach(s => coords.push({ lat: s.lat, lng: s.lng }));
  coords.push({ lat: depot.lat, lng: depot.lng });

  if (window._directionsPolyline) window._directionsPolyline.setMap(null);
  window._directionsPolyline = new google.maps.Polyline({
    path: coords,
    geodesic: true,
    strokeColor: '#2563EB',
    strokeOpacity: 0.7,
    strokeWeight: 3,
    icons: [{
      icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: '#2563EB' },
      offset: '50%', repeat: '100px'
    }],
    map: map
  });

  const bounds = new google.maps.LatLngBounds();
  coords.forEach(c => bounds.extend(c));
  map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
}

// (Leaflet fallback removed — Google Maps is the sole map provider)

// ==================== SATELLITE PROPERTY VIEW ====================
function focusStopOnMap(stopId) {
  const stops = window._routeDetailStops || [];
  const stop = stops.find(s => s.id === stopId);
  if (!stop || !stop.lat || !stop.lng) return;

  // Google Maps version
  if (window._gmap) {
    window._gmap.setMapTypeId(google.maps.MapTypeId.HYBRID);
    window._gmap.setCenter({ lat: stop.lat, lng: stop.lng });
    window._gmap.setZoom(18);
    document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mapLayerHybrid')?.classList.add('active');
    // Open info window
    const markerEntry = window._routeMarkers[stopId];
    if (markerEntry?.infoWindow && markerEntry?.marker) {
      closeAllInfoWindows();
      markerEntry.infoWindow.open(window._gmap, markerEntry.marker);
    }
  }

  // Show property sidebar
  const sidebar = document.getElementById('routeMapSidebar');
  if (sidebar) {
    sidebar.style.display = 'block';
    sidebar.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <strong style="font-size:14px"><i class="fas fa-satellite" style="color:var(--navy-light)"></i> ${t('route_property_view')}</strong>
        <button onclick="document.getElementById('routeMapSidebar').style.display='none';resetRouteMapView()" style="border:none;background:none;cursor:pointer;font-size:16px;color:var(--gray-400)">&times;</button>
      </div>
      <div style="background:var(--gray-50);border-radius:8px;padding:10px;margin-bottom:10px">
        <div style="font-weight:700;font-size:15px">${escapeHtml(stop.business_name)}</div>
        <div style="font-size:12px;color:var(--gray-500)">${stop.order_number || ''} &bull; Stop #${stop.sequence}</div>
      </div>
      <div style="font-size:13px;margin-bottom:8px">
        <div><i class="fas fa-map-marker-alt" style="color:var(--red);width:16px"></i> ${stop.street || '-'}, ${stop.city || ''} ${stop.zip || ''}</div>
        ${stop.gate_code ? `<div style="margin-top:4px"><i class="fas fa-key" style="color:var(--orange);width:16px"></i> Gate: <strong>${stop.gate_code}</strong></div>` : ''}
        ${stop.customer_phone ? `<div style="margin-top:4px"><i class="fas fa-phone" style="color:var(--green);width:16px"></i> <a href="tel:${stop.customer_phone}">${stop.customer_phone}</a></div>` : ''}
      </div>
      ${stop.driver_notes ? `<div style="padding:8px;background:#FFF7ED;border-radius:6px;font-size:12px;border-left:3px solid var(--orange);margin-bottom:8px"><i class="fas fa-truck" style="color:var(--orange)"></i> ${escapeHtml(stop.driver_notes)}</div>` : ''}
      ${stop.special_instructions ? `<div style="padding:8px;background:#FEF3C7;border-radius:6px;font-size:12px;border-left:3px solid #F59E0B;margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="color:#F59E0B"></i> ${escapeHtml(stop.special_instructions)}</div>` : ''}
      <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px">${priorityBadge(stop.priority)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}" target="_blank" class="btn btn-primary btn-sm" style="font-size:11px;flex:1"><i class="fas fa-directions"></i> Navigate</a>
        <a href="https://www.google.com/maps/@${stop.lat},${stop.lng},18z/data=!3m1!1e3" target="_blank" class="btn btn-outline btn-sm" style="font-size:11px;flex:1"><i class="fas fa-external-link-alt"></i> Google Maps</a>
      </div>`;
  }

  highlightStopRow(stopId);
}

// Reset route map to show full route
function resetRouteMapView() {
  if (window._gmap) {
    const stops = (window._routeDetailStops || []).filter(s => s.lat && s.lng);
    const depot = window.__DEPOT || DEPOT;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: depot.lat, lng: depot.lng });
    stops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
    window._gmap.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    window._gmap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
    document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mapLayerStreet')?.classList.add('active');
  }
}

// ==================== ROUTE OPTIMIZATION ====================
async function optimizeRoute(routeId) {
  const banner = document.getElementById('optimizeResultBanner');
  banner.style.display = 'block';
  banner.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin" style="color:var(--navy-light);margin-right:8px"></i><strong>${t('route_optimizing')}</strong></div></div>`;
  try {
    const { data } = await API.post(`/routes/${routeId}/optimize`);
    const s = data.stats;
    banner.innerHTML = `<div class="card" style="border:2px solid var(--green)">
      <div class="card-body" style="padding:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--green);color:white;display:flex;align-items:center;justify-content:center;font-size:20px"><i class="fas fa-check"></i></div>
          <div>
            <strong style="font-size:16px;color:var(--green)">${t('route_optimized')}</strong>
            <div style="font-size:13px;color:var(--gray-500)">${t('route_saved')} ${s.saved_miles} mi (${s.saved_pct}%)</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
          <div style="text-align:center;padding:10px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:20px;font-weight:800;color:var(--navy)">${s.optimized_miles} mi</div>
            <div style="font-size:11px;color:var(--gray-500)">${t('route_total_distance')}</div>
          </div>
          <div style="text-align:center;padding:10px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:20px;font-weight:800;color:var(--navy)">${s.estimated_time}</div>
            <div style="font-size:11px;color:var(--gray-500)">${t('route_est_time')}</div>
          </div>
          <div style="text-align:center;padding:10px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:20px;font-weight:800;color:var(--green)">-${s.saved_miles} mi</div>
            <div style="font-size:11px;color:var(--gray-500)">${t('route_miles_saved')}</div>
          </div>
          <div style="text-align:center;padding:10px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:20px;font-weight:800;color:var(--orange)">${s.estimated_fuel_gal} gal</div>
            <div style="font-size:11px;color:var(--gray-500)">${t('route_fuel')} (~$${s.estimated_fuel_cost})</div>
          </div>
        </div>
      </div>
    </div>`;
    showToast(`${t('route_optimized')} - ${t('route_saved')} ${s.saved_miles} mi!`);
    // Reload route detail
    setTimeout(() => renderRouteDetail(routeId), 1500);
  } catch (err) {
    banner.innerHTML = `<div class="card"><div class="card-body"><div class="scan-result-banner error"><i class="fas fa-exclamation-circle"></i> ${err.response?.data?.error || 'Optimization failed'}</div></div></div>`;
  }
}

// ==================== STOP REORDERING ====================
async function moveStop(routeId, stopId, direction) {
  const stops = window._routeDetailStops || [];
  const idx = stops.findIndex(s => s.id === stopId);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= stops.length) return;
  // Swap in the order array
  const newOrder = stops.map(s => s.id);
  [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
  try {
    await API.put(`/routes/${routeId}/reorder`, { stop_order: newOrder });
    showToast(t('route_reordered'));
    renderRouteDetail(routeId);
  } catch (err) { showToast('Failed to reorder', 'error'); }
}

// ==================== STOP NOTES EDITING ====================
function editStopNote(stopId, currentNote) {
  const note = prompt(t('route_enter_note'), currentNote || '');
  if (note === null) return; // cancelled
  API.put(`/route-stops/${stopId}`, { notes: note })
    .then(() => { showToast(t('route_note_saved')); renderRouteDetail(window._currentRouteId); })
    .catch(() => showToast('Failed to save note', 'error'));
}

// ==================== PALLET CORRECTION ====================
function editStopPallets(stopId, orderId, calculatedPallets, actualPallets, isCorrected, routeId) {
  const currentVal = isCorrected ? actualPallets : calculatedPallets;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:420px">
    <div class="modal-header">
      <h3 class="modal-title"><i class="fas fa-pallet" style="color:#D97706"></i> Correct Pallet Count</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body">
      <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px;margin-bottom:16px">
        <div style="font-size:12px;color:#92400E;font-weight:600"><i class="fas fa-lightbulb"></i> Your corrections teach the system</div>
        <div style="font-size:11px;color:#A16207;margin-top:4px">When you correct a pallet count, the system learns from it to make better calculations next time.</div>
      </div>
      <div style="display:flex;gap:20px;margin-bottom:16px">
        <div style="flex:1;text-align:center;padding:12px;background:#F3F4F6;border-radius:8px">
          <div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;font-weight:600">System Calculated</div>
          <div style="font-size:24px;font-weight:800;color:var(--gray-400)">${calculatedPallets}</div>
        </div>
        <div style="flex:1;text-align:center;padding:12px;background:#FEF3C7;border-radius:8px;border:2px solid #F59E0B">
          <div style="font-size:10px;color:#92400E;text-transform:uppercase;font-weight:600">Actual Pallets</div>
          <input type="number" id="palletCorrectionInput" value="${currentVal}" min="0" max="99" style="font-size:24px;font-weight:800;color:#92400E;text-align:center;width:60px;border:none;background:transparent;outline:none" autofocus>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" style="font-size:11px">Notes (optional)</label>
        <input type="text" id="palletCorrectionNotes" class="form-input" placeholder="e.g. Combined 2 half-pallets into 1" style="font-size:12px">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitPalletCorrection(${stopId}, ${orderId}, ${calculatedPallets}, ${routeId})">
        <i class="fas fa-check"></i> Save Correction
      </button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('palletCorrectionInput')?.focus(), 100);
}

async function submitPalletCorrection(stopId, orderId, calculatedPallets, routeId) {
  const actual = parseInt(document.getElementById('palletCorrectionInput')?.value || '0');
  const notes = document.getElementById('palletCorrectionNotes')?.value || '';
  if (isNaN(actual) || actual < 0) { showToast('Invalid pallet count', 'error'); return; }
  try {
    await API.post('/learning/pallet-correction', {
      context_type: 'route_stop', context_id: stopId,
      route_id: routeId, order_id: orderId,
      calculated_pallets: calculatedPallets, actual_pallets: actual, notes
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast(`Pallet count corrected: ${calculatedPallets}p → ${actual}p`, 'success');
    renderRouteDetail(routeId);
  } catch (e) { showToast('Failed to save correction', 'error'); }
}

// ==================== ADD/REMOVE STOPS ====================
async function showAddStopModal(routeId) {
  const [ordersRes, returnsRes] = await Promise.all([
    API.get('/orders?status=new&status=confirmed'),
    API.get('/returns/actionable').catch(() => ({ data: { returns: [] } }))
  ]);
  const orders = ordersRes.data.orders.filter(o => ['new','confirmed'].includes(o.status) && !o.route_id);
  const returns = (returnsRes.data.returns || []).filter(r => !r.route_id);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  const hasItems = orders.length > 0 || returns.length > 0;
  modal.innerHTML = `<div class="modal">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-plus-circle" style="color:var(--navy-light)"></i> ${t('route_add_stop')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      ${!hasItems ? `<div class="empty-state" style="padding:20px"><p>No available orders or returns to add</p></div>` : `
      <div style="max-height:400px;overflow-y:auto">
        ${returns.length > 0 ? `
        <div style="padding:8px 14px;background:#F5F3FF;font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px">
          <i class="fas fa-rotate-left"></i> Returns Pending Pickup (${returns.length})
        </div>
        ${returns.map(r => {
          const itemSummary = (r.items||[]).map(it => it.expected_qty + 'x ' + (it.product_name||it.sku)).join(', ');
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--gray-100);cursor:pointer;border-radius:8px;background:#FAFAFA" class="hover-row"
            onclick="addReturnStopToRoute(${routeId},${r.id});this.closest('.modal-overlay').remove()">
            <div style="min-width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0"><i class="fas fa-rotate-left"></i></div>
            <div style="flex:1;min-width:0">
              <strong style="color:#7C3AED">Return #${r.id}</strong> - ${r.business_name}
              <div style="font-size:12px;color:var(--gray-500)">${r.street||''}, ${r.city||''}</div>
              <div style="font-size:11px;color:var(--gray-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${itemSummary||'No items'}</div>
            </div>
            <span class="badge" style="background:#EDE9FE;color:#7C3AED;font-size:10px">${r.status}</span>
          </div>`;
        }).join('')}` : ''}
        ${orders.length > 0 ? `
        <div style="padding:8px 14px;background:#EFF6FF;font-size:12px;font-weight:700;color:#1D4ED8;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px">
          <i class="fas fa-box"></i> Orders (${orders.length})
        </div>
        ${orders.map(o => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--gray-100);cursor:pointer;border-radius:8px" class="hover-row"
          onclick="addStopToRoute(${routeId},${o.id});this.closest('.modal-overlay').remove()">
          <div style="flex:1"><strong>${o.order_number}</strong> - ${o.business_name}<div style="font-size:12px;color:var(--gray-500)">${o.street||''}, ${o.city||''}</div></div>
          ${priorityBadge(o.priority)}
        </div>`).join('')}` : ''}
      </div>`}
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function addStopToRoute(routeId, orderId) {
  try {
    await API.post(`/routes/${routeId}/stops`, { order_id: orderId });
    showToast(t('route_stop_added'));
    renderRouteDetail(routeId);
  } catch (err) { showToast('Failed to add stop', 'error'); }
}

async function addReturnStopToRoute(routeId, returnId) {
  try {
    await API.post(`/routes/${routeId}/return-stops`, { return_id: returnId });
    showToast('Return added to route');
    renderRouteDetail(routeId);
  } catch (err) { showToast(err?.response?.data?.error || 'Failed to add return to route', 'error'); }
}

async function removeStopFromRoute(routeId, stopId, name) {
  if (!confirm(`Remove ${name} from this route?`)) return;
  try {
    await API.delete(`/routes/${routeId}/stops/${stopId}`);
    showToast(t('route_stop_removed'));
    renderRouteDetail(routeId);
  } catch (err) { showToast('Failed to remove stop', 'error'); }
}

async function showNewRouteModal() {
  const [driversRes, trucksRes, ordersRes, zonesRes, returnsRes] = await Promise.all([
    API.get('/drivers'), API.get('/trucks'),
    API.get('/orders?status=new&status=confirmed'),
    API.get('/zones'),
    API.get('/returns/actionable').catch(() => ({ data: { returns: [] } }))
  ]);
  const availOrders = geoSortOrders(ordersRes.data.orders.filter(o => ['new','confirmed'].includes(o.status) && !o.route_id));
  const availReturns = (returnsRes.data.returns || []).filter(r => !r.route_id);
  const zones = zonesRes.data.zones || [];
  // Build drivers cache for badge rendering
  window._driversCache = {};
  (driversRes.data.drivers || []).forEach(d => { window._driversCache[d.id] = d.name; });
  // Store for live totals calculation
  window._createRouteOrders = {};
  availOrders.forEach(o => { window._createRouteOrders[o.id] = o; });
  window._createRouteReturns = {};
  availReturns.forEach(r => {
    const totalQty = (r.items||[]).reduce((s,i) => s + (i.expected_qty||0), 0);
    // Use server-provided pallet_count if available, otherwise compute with grouped logic
    const pallets = r.pallet_count != null ? r.pallet_count : calcPallets(r.items || []);
    window._createRouteReturns[r.id] = { ...r, item_count: totalQty, pallet_count: Math.max(pallets, r.items?.length > 0 ? 1 : 0) };
  });
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg" style="max-width:900px">
    <div class="modal-header">
      <h3 class="modal-title"><i class="fas fa-route" style="color:var(--navy-light)"></i> Create New Route</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body">
      <!-- Smart Build Banner -->
      <div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:12px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;color:var(--navy);font-size:15px"><i class="fas fa-wand-magic-sparkles" style="color:var(--orange)"></i> ${t('smart_build_title')}</div>
          <div style="font-size:12px;color:var(--gray-600);margin-top:2px">${t('smart_build_desc')}</div>
        </div>
        <button class="btn btn-sm" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700" onclick="runCreateRouteAiSuggest()"><i class="fas fa-brain"></i> AI Suggest</button>
        <button class="btn btn-primary btn-sm" id="smartBuildBtn" onclick="runSmartBuild()"><i class="fas fa-bolt"></i> ${t('smart_build_btn')}</button>
      </div>

      <div class="form-row-3">
        <div class="form-group"><label class="form-label">${t('common_date')} *</label><input class="form-input" type="date" id="newRouteDate" value="${dayjs().format('YYYY-MM-DD')}" onchange="clearSmartPreview()"></div>
        <div class="form-group"><label class="form-label">${t('packing_driver')}</label>
          <select class="form-select" id="newRouteDriver" onchange="updateRouteOrderSummary()"><option value="">Select driver...</option>${driversRes.data.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">${t('packing_truck')}</label>
          <select class="form-select" id="newRouteTruck" onchange="clearSmartPreview();updateRouteOrderSummary()"><option value="">Select truck...</option>${trucksRes.data.trucks.map(t => `<option value="${t.id}" data-pallets="${t.max_pallet_spots||12}" data-truck-type="${t.truck_type||''}">${t.name} (${t.max_pallet_spots||12}p) ${t.truck_type==='pallet'?'[BIG]':'[SMALL]'}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row-3" style="grid-template-columns:1fr 1fr 1fr">
        <div class="form-group"><label class="form-label">${t('smart_build_zone_filter')}</label>
          <select class="form-select" id="newRouteZone" onchange="clearSmartPreview()">
            <option value="">${t('smart_build_all_zones')}</option>
            ${zones.map(z => `<option value="${z.id}" style="border-left:3px solid ${z.color}">${z.name} (${z.delivery_days})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:span 2"><label class="form-label">${t('route_notes')}</label><input class="form-input" id="newRouteNotes" placeholder="Route notes..."></div>
      </div>

      <!-- Smart Build Preview -->
      <div id="smartBuildPreview" style="display:none;margin-bottom:16px"></div>

      <!-- LIVE TOTALS BAR -->
      <div id="routeLiveTotals" style="display:none;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:10px;padding:12px 16px;margin-bottom:16px;border:1px solid #93C5FD">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-map-pin" style="color:#059669;font-size:14px"></i><div><div id="rtStops" style="font-size:18px;font-weight:800;color:var(--navy)">0</div><div style="font-size:9px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Stops</div></div></div>
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-boxes-stacked" style="color:#2563EB;font-size:14px"></i><div><div id="rtUnits" style="font-size:18px;font-weight:800;color:var(--navy)">0</div><div style="font-size:9px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Units</div></div></div>
          <div style="display:flex;align-items:center;gap:6px"><i class="fas fa-pallet" style="color:#D97706;font-size:14px"></i><div><div id="rtPallets" style="font-size:18px;font-weight:800;color:var(--navy)">0</div><div style="font-size:9px;color:var(--gray-500);text-transform:uppercase;font-weight:600">Pallets</div></div></div>
          <div id="rtCapacity" style="display:none;margin-left:auto;display:flex;align-items:center;gap:6px">
            <div style="width:80px;height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden"><div id="rtCapBar" style="height:100%;border-radius:4px;transition:width 0.3s"></div></div>
            <span id="rtCapPct" style="font-size:11px;font-weight:700"></span>
          </div>
        </div>
      </div>

      <!-- Returns Selection -->
      ${availReturns.length > 0 ? `<div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:6px">
          <i class="fas fa-rotate-left" style="color:#7C3AED"></i> Returns Pending Pickup
          <span class="badge" style="background:#EDE9FE;color:#7C3AED;font-size:11px">${availReturns.length}</span>
        </label>
        <div style="max-height:180px;overflow-y:auto;border:1px solid #C4B5FD;border-radius:8px;background:#FAF5FF">
          ${availReturns.map(r => {
            const totalQty = (r.items||[]).reduce((s,i) => s + (i.expected_qty||0), 0);
            const itemSummary = (r.items||[]).map(it => it.expected_qty + 'x ' + (it.product_name||it.sku)).join(', ');
            return `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #EDE9FE;cursor:pointer" class="route-return-check">
              <input type="checkbox" value="${r.id}" style="accent-color:#7C3AED" onchange="updateRouteOrderSummary()">
              <div style="min-width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0"><i class="fas fa-rotate-left"></i></div>
              <div style="flex:1;min-width:0">
                <strong style="color:#7C3AED;font-size:13px">Return #${r.id}</strong> — ${r.business_name}
                <div style="font-size:11px;color:var(--gray-500)">${r.street||''}, ${r.city||''}</div>
                <div style="font-size:10px;color:var(--gray-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${itemSummary||'No items'}</div>
              </div>
              <span style="font-size:11px;font-weight:700;color:#7C3AED;white-space:nowrap">${totalQty} units</span>
            </label>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Manual Order Selection (grouped by date) -->
      <div class="form-group" id="manualOrderSection">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
          <span>Select Orders</span>
          <span id="routeOrderSummary" style="font-size:12px;font-weight:600;color:var(--gray-500)"></span>
        </label>
        <div style="max-height:340px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:8px">
          ${availOrders.length===0?'<div class="empty-state" style="padding:20px"><p>No available orders (all orders are already routed)</p></div>':
            buildGroupedOrderList(availOrders)}
        </div>
      </div>

      <!-- STOPS PREVIEW -->
      <div id="routeStopsPreview" style="display:none"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" id="createRouteBtn" onclick="submitNewRoute()"><i class="fas fa-route"></i> Create Route</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function buildGroupedOrderList(orders) {
  const today = dayjs().format('YYYY-MM-DD');
  // Group by date, then geo-sort within each group
  const groups = {};
  orders.forEach(o => {
    const d = o.scheduled_date || '__none__';
    if (!groups[d]) groups[d] = [];
    groups[d].push(o);
  });
  // Sort date keys: past first, then today, then future, no-date last
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return a.localeCompare(b);
  });
  // Geo-sort orders within each date group
  keys.forEach(k => { groups[k] = geoSortOrders(groups[k]); });
  return `<div id="createRouteOrdersMap" style="height:220px;border-bottom:1px solid var(--gray-200)"></div>` +
  keys.map(dateKey => {
    const items = groups[dateKey];
    const isPast = dateKey !== '__none__' && dateKey < today;
    const isToday = dateKey === today;
    const label = dateKey === '__none__' ? 'No Date Scheduled' : (isToday ? `Today — ${formatDate(dateKey)}` : formatDate(dateKey));
    const tagColor = isPast ? '#DC2626' : isToday ? '#059669' : '#2563EB';
    const tagBg = isPast ? '#FEE2E2' : isToday ? '#D1FAE5' : '#DBEAFE';
    const tagLabel = isPast ? 'Past' : isToday ? 'Today' : '';
    const safeKey = dateKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `<div class="date-group">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:#F9FAFB;border-bottom:1px solid var(--gray-200);position:sticky;top:0;z-index:1">
        <input type="checkbox" onchange="toggleDateGroup('${safeKey}',this.checked)" style="accent-color:${tagColor}">
        <span style="font-weight:700;font-size:13px;color:var(--navy)">${label}</span>
        ${tagLabel ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${tagBg};color:${tagColor}">${tagLabel}</span>` : ''}
        <span style="font-size:11px;color:var(--gray-400);margin-left:auto">${items.length} order${items.length!==1?'s':''}</span>
      </div>
      ${items.map(o => {
        const reqBadges = [truckReqBadge(o.truck_requirement), driverRestrictionBadges(o.driver_restrictions, true)].filter(Boolean).join(' ');
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px 8px 28px;border-bottom:1px solid var(--gray-100);cursor:pointer" class="route-order-check date-group-${safeKey}" data-truck-req="${o.truck_requirement||''}" data-driver-restrictions="${(o.driver_restrictions||'').replace(/"/g,'&quot;')}">
        <input type="checkbox" value="${o.id}" onchange="updateRouteOrderSummary();updateDateGroupHeader('${safeKey}')">
        <div style="flex:1">
          <div><strong>${o.order_number}</strong> - ${o.business_name}</div>
          <div style="font-size:11px;color:var(--gray-500)">${o.street||''}, ${o.city||''}</div>
          ${reqBadges ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${reqBadges}</div>` : ''}
        </div>
        <span style="font-size:11px;font-weight:700;color:var(--navy);white-space:nowrap">${o.item_count||0}u / ${o.pallet_count||0}p</span>
        ${priorityBadge(o.priority)}
      </label>`;
      }).join('')}
    </div>`;
  }).join('');
  // Render map inside the order selection after DOM is inserted
  setTimeout(() => {
    const allOrders = Object.values(window._createRouteOrders || {});
    window._createRouteSelectMap = renderPendingOrdersMap('createRouteOrdersMap', geoSortOrders(allOrders), {
      height: '220px',
      onClick: (o) => {
        const cb = document.querySelector(`.route-order-check input[value="${o.id}"]`);
        if (cb) { cb.checked = !cb.checked; updateRouteOrderSummary(); }
      }
    });
  }, 200);
}

function toggleDateGroup(safeKey, checked) {
  document.querySelectorAll(`.date-group-${safeKey} input[type="checkbox"]`).forEach(cb => { cb.checked = checked; });
  updateRouteOrderSummary();
}

function updateDateGroupHeader(safeKey) {
  const cbs = document.querySelectorAll(`.date-group-${safeKey} input[type="checkbox"]`);
  const allChecked = [...cbs].every(cb => cb.checked);
  const someChecked = [...cbs].some(cb => cb.checked);
  // Find the group header checkbox (parent .date-group's first checkbox)
  const groupEl = document.querySelector(`.date-group-${safeKey}`)?.closest('.date-group');
  if (groupEl) {
    const headerCb = groupEl.querySelector(':scope > div:first-child input[type="checkbox"]');
    if (headerCb) { headerCb.checked = allChecked; headerCb.indeterminate = someChecked && !allChecked; }
  }
}

function updateRouteOrderSummary() {
  const orderChecks = document.querySelectorAll('.route-order-check input:checked');
  const returnChecks = document.querySelectorAll('.route-return-check input:checked');
  const orderIds = Array.from(orderChecks).map(c => parseInt(c.value));
  const returnIds = Array.from(returnChecks).map(c => parseInt(c.value));
  const totalStops = orderIds.length + returnIds.length;

  // Calculate totals from stored data
  let totalUnits = 0, totalPallets = 0;
  const previewItems = [];
  orderIds.forEach(id => {
    const o = window._createRouteOrders?.[id];
    if (o) {
      totalUnits += o.item_count || 0;
      totalPallets += o.pallet_count || 0;
      previewItems.push({ type: 'order', id: o.id, label: o.order_number, name: o.business_name, address: `${o.street||''} ${o.city||''}`, units: o.item_count||0, pallets: o.pallet_count||0, priority: o.priority, lat: o.lat, lng: o.lng, truck_requirement: o.truck_requirement, driver_restrictions: o.driver_restrictions });
    }
  });
  returnIds.forEach(id => {
    const r = window._createRouteReturns?.[id];
    if (r) {
      totalUnits += r.item_count || 0;
      totalPallets += r.pallet_count || 0;
      previewItems.push({ type: 'return', id: r.id, label: `Return #${r.id}`, name: r.business_name, address: `${r.street||''} ${r.city||''}`, units: r.item_count||0, pallets: r.pallet_count||0, lat: r.lat, lng: r.lng });
    }
  });

  // Update summary text
  const el = document.getElementById('routeOrderSummary');
  if (el) el.innerHTML = totalStops > 0 ? `${orderIds.length} order${orderIds.length!==1?'s':''} ${returnIds.length > 0 ? `+ ${returnIds.length} return${returnIds.length!==1?'s':''}` : ''} selected` : '';

  // Update live totals bar
  const bar = document.getElementById('routeLiveTotals');
  if (bar) bar.style.display = totalStops > 0 ? '' : 'none';
  const stopsEl = document.getElementById('rtStops');
  const unitsEl = document.getElementById('rtUnits');
  const palletsEl = document.getElementById('rtPallets');
  if (stopsEl) stopsEl.textContent = totalStops;
  if (unitsEl) unitsEl.textContent = totalUnits;
  if (palletsEl) palletsEl.textContent = totalPallets;

  // Capacity bar based on selected truck
  const truckSel = document.getElementById('newRouteTruck');
  const capWrap = document.getElementById('rtCapacity');
  if (truckSel && capWrap) {
    const opt = truckSel.selectedOptions[0];
    const maxPallets = parseInt(opt?.dataset?.pallets) || 0;
    if (maxPallets > 0 && totalStops > 0) {
      capWrap.style.display = 'flex';
      const pct = Math.min(Math.round(totalPallets / maxPallets * 100), 100);
      const capBar = document.getElementById('rtCapBar');
      const capPct = document.getElementById('rtCapPct');
      if (capBar) { capBar.style.width = pct + '%'; capBar.style.background = pct > 90 ? '#DC2626' : pct > 70 ? '#D97706' : '#059669'; }
      if (capPct) { capPct.textContent = pct + '% of ' + maxPallets + 'p'; capPct.style.color = pct > 90 ? '#DC2626' : pct > 70 ? '#D97706' : '#059669'; }
    } else { capWrap.style.display = 'none'; }
  }

  // Check for truck/driver conflicts
  const truckSel2 = document.getElementById('newRouteTruck');
  const driverSel2 = document.getElementById('newRouteDriver');
  const selectedTruckType = truckSel2?.selectedOptions[0]?.dataset?.truckType || '';
  const selectedDriverId = driverSel2?.value || '';
  const warnings = [];

  // Highlight order rows with conflicts
  document.querySelectorAll('.route-order-check').forEach(label => {
    const cb = label.querySelector('input[type="checkbox"]');
    if (!cb?.checked) { label.style.borderLeft = ''; return; }
    const truckReq = label.dataset.truckReq || '';
    const driverRestr = label.dataset.driverRestrictions || '';
    let conflict = false;
    // Truck conflict: order needs "big" but truck is bale (small) or vice versa
    if (truckReq && selectedTruckType) {
      const isBigTruck = selectedTruckType === 'pallet';
      if (truckReq === 'big' && !isBigTruck) { conflict = true; const oData = window._createRouteOrders?.[cb.value]; warnings.push(`<i class="fas fa-truck"></i> <strong>${oData?.order_number || '#'+cb.value}</strong> requires BIG TRUCK`); }
      if (truckReq === 'small' && isBigTruck) { conflict = true; const oData = window._createRouteOrders?.[cb.value]; warnings.push(`<i class="fas fa-truck-pickup"></i> <strong>${oData?.order_number || '#'+cb.value}</strong> requires SMALL TRUCK`); }
    }
    // Driver conflict: selected driver is blocked for this address
    if (selectedDriverId && driverRestr) {
      try {
        const restr = JSON.parse(driverRestr);
        if (restr[selectedDriverId] === 'blocked') { conflict = true; const oData = window._createRouteOrders?.[cb.value]; const driverName = driverSel2?.selectedOptions[0]?.textContent || 'Driver'; warnings.push(`<i class="fas fa-ban"></i> <strong>${driverName}</strong> cannot deliver to ${oData?.business_name || '#'+cb.value}`); }
      } catch {}
    }
    label.style.borderLeft = conflict ? '3px solid #DC2626' : '';
  });

  // Show warnings
  let warningsEl = document.getElementById('routeConflictWarnings');
  if (!warningsEl) {
    const totalsBar = document.getElementById('routeLiveTotals');
    if (totalsBar) { const w = document.createElement('div'); w.id = 'routeConflictWarnings'; totalsBar.after(w); warningsEl = w; }
  }
  if (warningsEl) {
    if (warnings.length > 0) {
      warningsEl.innerHTML = `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:10px 14px;margin-bottom:12px">
        <div style="font-weight:700;color:#991B1B;font-size:12px;margin-bottom:6px"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>${warnings.length} Conflict${warnings.length>1?'s':''}</div>
        ${warnings.map(w => `<div style="font-size:11px;color:#DC2626;padding:2px 0">${w}</div>`).join('')}
      </div>`;
    } else { warningsEl.innerHTML = ''; }
  }

  // Render stops preview
  const previewEl = document.getElementById('routeStopsPreview');
  if (previewEl) {
    if (previewItems.length === 0) {
      previewEl.style.display = 'none';
      window._createRouteMap = null;
      return;
    }
    previewEl.style.display = '';
    previewEl.innerHTML = `<div class="card" style="margin-bottom:0">
      <div class="card-header" style="padding:10px 16px">
        <h3 class="card-title" style="font-size:13px"><i class="fas fa-list-ol" style="color:var(--navy-light);margin-right:6px"></i>Route Preview — ${previewItems.length} stops · ${totalUnits} units · ${totalPallets} pallets</h3>
      </div>
      <div id="createRouteMapContainer" style="height:250px;border-bottom:1px solid var(--gray-200)"></div>
      <div style="max-height:200px;overflow-y:auto">
        <table style="font-size:12px;width:100%"><thead><tr>
          <th style="width:30px;padding:6px 8px">#</th><th style="padding:6px 8px">Stop</th><th style="padding:6px 8px">Customer</th><th style="padding:6px 8px">Address</th><th style="padding:6px 8px;text-align:right">Units</th><th style="padding:6px 8px;text-align:right">Pallets</th>
        </tr></thead>
        <tbody>${previewItems.map((p, i) => {
          const isRet = p.type === 'return';
          const stopReqs = !isRet ? [truckReqBadge(p.truck_requirement), driverRestrictionBadges(p.driver_restrictions, true)].filter(Boolean).join(' ') : '';
          return `<tr style="${isRet?'background:#FAF5FF;':''}" onmouseenter="highlightPreviewStop(${i})" onmouseleave="unhighlightPreviewStop(${i})">
            <td style="padding:4px 8px;text-align:center"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${isRet?'linear-gradient(135deg,#7C3AED,#5B21B6)':'var(--navy)'};color:white;font-size:10px;font-weight:700">${isRet?'<i class="fas fa-rotate-left" style="font-size:8px"></i>':(i+1)}</span></td>
            <td style="padding:4px 8px;font-weight:700;color:${isRet?'#7C3AED':'var(--navy)'}">${p.label} ${isRet?'<span style="font-size:9px;background:#EDE9FE;color:#7C3AED;padding:1px 4px;border-radius:3px">PICKUP</span>':''}${stopReqs ? '<div style="margin-top:2px">'+stopReqs+'</div>':''}</td>
            <td style="padding:4px 8px">${p.name}</td>
            <td style="padding:4px 8px;color:var(--gray-500);font-size:11px">${p.address}</td>
            <td style="padding:4px 8px;text-align:right;font-weight:700">${p.units}</td>
            <td style="padding:4px 8px;text-align:right;font-weight:700">${p.pallets}</td>
          </tr>`;
        }).join('')}
        <tr style="background:#F0F9FF;font-weight:800">
          <td colspan="4" style="padding:6px 8px;text-align:right;color:var(--navy)">TOTAL</td>
          <td style="padding:6px 8px;text-align:right;color:var(--navy)">${totalUnits}</td>
          <td style="padding:6px 8px;text-align:right;color:var(--navy)">${totalPallets}</td>
        </tr></tbody></table>
      </div>
    </div>`;
    // Render map after DOM is ready
    setTimeout(() => renderCreateRouteMap(previewItems), 50);
  }
}

function renderCreateRouteMap(items) {
  const container = document.getElementById('createRouteMapContainer');
  if (!container) return;
  // Depot coords
  const depot = { lat: 26.7045593, lng: -80.2047917 };
  const geoItems = items.filter(p => p.lat && p.lng);

  // Remove old map
  if (window._createRouteMap) { window._createRouteMap = null; }

  if (!window.__gmapsLoaded) return;

  if (geoItems.length === 0) {
    container.style.height = '60px';
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray-400);font-size:12px"><i class="fas fa-map-marker-alt" style="margin-right:6px"></i>No geocoded addresses — map unavailable</div>';
    return;
  }
  container.style.height = '250px';
  container.innerHTML = '';

  const map = new google.maps.Map(container, { center: { lat: depot.lat, lng: depot.lng }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, scrollwheel: false });
  window._createRouteMap = map;
  window._createRouteMapMarkers = [];

  // Depot marker
  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#F97316', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });

  // Build route path: depot → stops → depot
  const routeCoords = [{ lat: depot.lat, lng: depot.lng }];
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });

  items.forEach((p, i) => {
    if (!p.lat || !p.lng) return;
    const isRet = p.type === 'return';
    const color = isRet ? '#7C3AED' : '#1E3A5F';
    const labelText = isRet ? '\uf2ea' : String(i + 1);
    const labelFont = isRet ? { text: labelText, fontFamily: 'Font Awesome 6 Free', fontWeight: '900', color: '#FFFFFF', fontSize: '9px' } : { text: labelText, color: '#FFFFFF', fontWeight: '700', fontSize: '10px' };
    const marker = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, label: labelFont, zIndex: 100 + i });
    const iw = new google.maps.InfoWindow({ content: `<strong>${p.label}</strong><br>${p.name}<br>${p.units}u / ${p.pallets}p` });
    marker.addListener('click', () => { iw.open(map, marker); });
    window._createRouteMapMarkers.push(marker);
    routeCoords.push({ lat: p.lat, lng: p.lng });
    bounds.extend({ lat: p.lat, lng: p.lng });
  });

  routeCoords.push({ lat: depot.lat, lng: depot.lng });

  // Draw route line
  if (routeCoords.length > 2) {
    new google.maps.Polyline({ path: routeCoords, geodesic: true, strokeColor: '#3B82F6', strokeOpacity: 0.7, strokeWeight: 3, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }], map });
  }

  // Fit bounds
  map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
}

function highlightPreviewStop(idx) {
  const markers = window._createRouteMapMarkers || [];
  if (markers[idx]) { markers[idx].setAnimation(google.maps.Animation.BOUNCE); }
}
function unhighlightPreviewStop(idx) {
  const markers = window._createRouteMapMarkers || [];
  if (markers[idx]) { markers[idx].setAnimation(null); }
}

async function runCreateRouteAiSuggest() {
  const date = document.getElementById('newRouteDate')?.value || dayjs().format('YYYY-MM-DD');
  const availOrders = Object.values(window._createRouteOrders || {});
  if (availOrders.length === 0) { showToast('No available orders to analyze', 'warning'); return; }
  const orderIds = availOrders.map(o => o.id);
  const preview = document.getElementById('smartBuildPreview');
  if (preview) { preview.style.display = 'block'; preview.innerHTML = '<div style="text-align:center;padding:16px"><i class="fas fa-brain fa-spin" style="color:#7C3AED"></i> AI is analyzing patterns...</div>'; }
  try {
    const { data } = await API.post('/learning/recommend', { date, order_ids: orderIds });
    if (!data.has_learning_data) { showAiNoDataModal(); if (preview) preview.style.display = 'none'; return; }
    showAiRecommendationsModal(data, date);
    if (preview) preview.style.display = 'none';
  } catch (e) {
    console.error('AI Suggest error:', e);
    if (preview) { preview.innerHTML = '<div style="text-align:center;padding:16px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> AI suggestion failed</div>'; }
  }
}

function clearSmartPreview() {
  const preview = document.getElementById('smartBuildPreview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  window._smartBuildData = null;
}

async function runSmartBuild() {
  const btn = document.getElementById('smartBuildBtn');
  const preview = document.getElementById('smartBuildPreview');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building...';
  preview.style.display = 'block';
  preview.innerHTML = '<div style="text-align:center;padding:16px"><i class="fas fa-spinner fa-spin" style="color:var(--navy-light)"></i> Analyzing orders, zones, and capacity...</div>';

  try {
    const date = document.getElementById('newRouteDate').value;
    const truck_id = parseInt(document.getElementById('newRouteTruck').value) || null;
    const zone_id = parseInt(document.getElementById('newRouteZone').value) || null;
    const driver_id = parseInt(document.getElementById('newRouteDriver').value) || null;

    const { data } = await API.post('/routes/smart-build', { date, truck_id, zone_id, driver_id });

    if (!data.preview?.orders?.length) {
      preview.innerHTML = `<div class="card" style="border:2px dashed var(--gray-300)"><div class="card-body" style="text-align:center;padding:24px">
        <i class="fas fa-inbox" style="font-size:24px;color:var(--gray-400);margin-bottom:8px"></i>
        <h3 style="color:var(--gray-500);font-weight:600">${t('smart_build_no_orders')}</h3>
        <p style="font-size:13px;color:var(--gray-400)">Try changing the date, zone, or truck to find matching orders.</p>
      </div></div>`;
      btn.disabled = false; btn.innerHTML = `<i class="fas fa-bolt"></i> ${t('smart_build_btn')}`;
      return;
    }

    const p = data.preview;
    window._smartBuildData = p;

    // Capacity bars
    const pPct = p.totals.pallets_pct;
    const pCls = pPct > 90 ? 'danger' : pPct > 70 ? 'warning' : 'safe';

    preview.innerHTML = `
      <div class="card" style="border:2px solid var(--navy-light)">
        <div class="card-header" style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE)">
          <h3 class="card-title"><i class="fas fa-magic" style="color:var(--orange)"></i> ${t('smart_build_preview')}</h3>
          <span style="font-size:12px;color:var(--gray-500)">${p.remaining_candidates} ${t('smart_build_remaining')}</span>
        </div>
        <div class="card-body">
          <!-- Stats Row -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-bottom:16px">
            <div style="text-align:center;padding:8px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:20px;font-weight:800;color:var(--navy)">${p.totals.orders}</div>
              <div style="font-size:11px;color:var(--gray-500)">${t('smart_build_stops')}</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:14px;font-weight:700;color:var(--navy)">${p.totals.pallets}</div>
              <div style="font-size:11px;color:var(--gray-500)">${t('smart_build_pallets')}</div>
              <div class="weight-bar" style="width:80px;margin:4px auto 0"><div class="weight-bar-fill ${pCls}" style="width:${pPct}%"></div></div>
              <div style="font-size:10px;color:var(--gray-400)">${pPct}% of ${p.totals.truck_pallet_capacity}</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:14px;font-weight:700;color:var(--navy)">${p.totals.estimated_miles} mi</div>
              <div style="font-size:11px;color:var(--gray-500)">${t('smart_build_miles')}</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:14px;font-weight:700;color:var(--navy)">${p.totals.estimated_fuel_gal} gal</div>
              <div style="font-size:11px;color:var(--gray-500)">~$${p.totals.estimated_fuel_cost}</div>
            </div>
          </div>

          <!-- Stop List -->
          <div style="max-height:200px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:8px">
            ${p.orders.map((o, i) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--gray-100)">
              <span class="stop-number" style="width:24px;height:24px;font-size:11px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--navy);color:white;flex-shrink:0">${i+1}</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px">${o.order_number} - ${o.business_name}</div>
                <div style="font-size:11px;color:var(--gray-500)">${o.street||''}, ${o.city||''} &bull; ${o.pallet_count} pallet${o.pallet_count!==1?'s':''}</div>
              </div>
              ${priorityBadge(o.priority)}
            </div>`).join('')}
          </div>

          <!-- Action -->
          <div style="margin-top:12px;text-align:center">
            <button class="btn btn-primary" onclick="confirmSmartBuild()"><i class="fas fa-check-circle"></i> ${t('smart_build_confirm')}</button>
          </div>
        </div>
      </div>`;
    btn.disabled = false; btn.innerHTML = `<i class="fas fa-bolt"></i> ${t('smart_build_btn')}`;
  } catch (err) {
    preview.innerHTML = `<div class="scan-result-banner error"><i class="fas fa-exclamation-circle"></i> Smart build failed: ${err.message || 'Unknown error'}</div>`;
    btn.disabled = false; btn.innerHTML = `<i class="fas fa-bolt"></i> ${t('smart_build_btn')}`;
  }
}

async function confirmSmartBuild() {
  const p = window._smartBuildData;
  if (!p) return;
  try {
    const date = document.getElementById('newRouteDate').value;
    const { data } = await API.post('/routes/smart-confirm', {
      date,
      truck_id: parseInt(document.getElementById('newRouteTruck').value) || null,
      driver_id: parseInt(document.getElementById('newRouteDriver').value) || null,
      order_ids: p.orders.map(o => o.id),
      notes: document.getElementById('newRouteNotes').value || null,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast(`Route ${data.route_number} created with ${p.orders.length} stops!`);
    navigate('routes', { viewId: data.id });
  } catch (err) { showToast('Failed to create route', 'error'); }
}

async function submitNewRoute() {
  const date = document.getElementById('newRouteDate').value;
  if (!date) { showToast('Please select a date', 'warning'); return; }
  const checks = document.querySelectorAll('.route-order-check input:checked');
  const order_ids = Array.from(checks).map(c => parseInt(c.value));
  const returnChecks = document.querySelectorAll('.route-return-check input:checked');
  const return_ids = Array.from(returnChecks).map(c => parseInt(c.value));
  if (order_ids.length === 0 && return_ids.length === 0) { showToast('Please select at least one order or return', 'warning'); return; }
  try {
    const { data } = await API.post('/routes', {
      date,
      driver_id: parseInt(document.getElementById('newRouteDriver').value) || null,
      truck_id: parseInt(document.getElementById('newRouteTruck').value) || null,
      order_ids,
      return_ids,
      notes: document.getElementById('newRouteNotes').value || null,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast(`Route ${data.route_number} created!`);
    navigate('routes', { viewId: data.id });
  } catch (err) { showToast('Failed to create route', 'error'); }
}

// ==================== GOOGLE MAPS ROUTE BUILDER ====================
// State for Route Builder
window._rb = { stops: [], orders: [], returns: [], drivers: [], trucks: [], zones: [], activeRoutes: [], allOrders: [], directions: null, map: null, markers: [], polyline: null, polylines: [], calculating: false, departureTime: '06:00', stopMinutes: 10, dragIdx: null, autoCalc: true };

async function renderRouteBuilder() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';

  const [driversRes, trucksRes, newOrdersRes, scheduledOrdersRes, zonesRes, returnsRes, routeCtxRes] = await Promise.all([
    API.get('/drivers'), API.get('/trucks'),
    API.get('/orders?status=new&status=confirmed'),
    API.get('/orders?status=scheduled&status=loaded&status=in_transit&status=delivered'),
    API.get('/zones'),
    API.get('/returns/actionable').catch(() => ({ data: { returns: [] } })),
    API.get('/routes/builder-context').catch(() => ({ data: { routes: [] } }))
  ]);
  const newConfirmedOrders = (newOrdersRes.data.orders || []).filter(o => !o.archived);
  const availOrders = newConfirmedOrders.filter(o => !o.route_id);
  const scheduledOrders = (scheduledOrdersRes.data.orders || []).filter(o => !o.archived);
  const allOrders = [...newConfirmedOrders, ...scheduledOrders];
  const allReturns = returnsRes.data.returns || [];
  const availReturns = allReturns.filter(r => !r.route_id);
  const routedReturns = allReturns.filter(r => r.route_id);
  const drivers = driversRes.data.drivers || [];
  const trucks = trucksRes.data.trucks || [];
  const zones = zonesRes.data.zones || [];
  const activeRoutes = routeCtxRes.data.routes || [];

  window._rb = { stops: [], orders: availOrders, returns: availReturns, allReturns, drivers, trucks, zones, activeRoutes, allOrders, scheduledOrders, directions: null, map: null, markers: [], polyline: null, polylines: [], calculating: false, departureTime: '06:00', stopMinutes: 10, dragIdx: null, autoCalc: true };

  pc.innerHTML = `
    <style>
      .rb-container { display:flex; gap:0; height:calc(100vh - 130px); min-height:500px; border-radius:12px; overflow:hidden; border:1px solid var(--gray-200); background:white; }
      .rb-left { width:440px; min-width:400px; max-width:500px; display:flex; flex-direction:column; border-right:1px solid var(--gray-200); background:#FAFBFC; overflow:hidden; }
      .rb-right { flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden; }
      .rb-header { padding:12px 16px; background:white; border-bottom:1px solid var(--gray-200); }
      .rb-stops-panel { flex:1; overflow-y:auto; padding:0; }
      .rb-stop-item { display:flex; align-items:flex-start; gap:8px; padding:8px 12px; border-bottom:1px solid #F3F4F6; transition:background 0.15s,box-shadow 0.15s; position:relative; cursor:grab; }
      .rb-stop-item:hover { background:#EFF6FF; }
      .rb-stop-item.rb-dragging { opacity:0.4; background:#DBEAFE; }
      .rb-stop-item.rb-drag-over { box-shadow:0 -3px 0 0 #4285F4; }
      .rb-stop-item.rb-depot { cursor:default; }
      .rb-stop-num { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:white; flex-shrink:0; margin-top:2px; }
      .rb-stop-info { flex:1; min-width:0; }
      .rb-stop-name { font-weight:700; font-size:12px; color:var(--navy); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rb-stop-addr { font-size:11px; color:var(--gray-500); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
      .rb-stop-addr:hover { color:#4285F4; text-decoration:underline; }
      .rb-stop-eta { font-size:10px; color:#059669; font-weight:600; margin-top:1px; }
      .rb-stop-actions { display:flex; gap:2px; flex-shrink:0; align-items:center; }
      .rb-stop-btn { width:22px; height:22px; border:none; background:none; cursor:pointer; border-radius:4px; font-size:10px; color:var(--gray-400); display:flex; align-items:center; justify-content:center; }
      .rb-stop-btn:hover { background:#E5E7EB; color:var(--navy); }
      .rb-leg-bar { display:flex; align-items:center; gap:6px; padding:2px 12px 2px 46px; background:#F8FAFC; border-bottom:1px solid #F3F4F6; font-size:10px; color:#6B7280; }
      .rb-leg-line { width:2px; height:14px; background:#D1D5DB; border-radius:1px; margin-left:1px; }
      .rb-leg-line.active { background:#4285F4; }
      .rb-orders-panel { flex:1; overflow-y:auto; }
      .rb-order-item { display:flex; align-items:center; gap:10px; padding:8px 14px; border-bottom:1px solid #F3F4F6; cursor:pointer; transition:background 0.15s; }
      .rb-order-item:hover { background:#F0FDF4; }
      .rb-order-item.added { opacity:0.4; pointer-events:none; background:#F9FAFB; }
      .rb-summary { padding:10px 14px; background:linear-gradient(135deg,#EFF6FF,#DBEAFE); border-top:1px solid #93C5FD; }
      .rb-map { flex:1; min-height:300px; }
      .rb-dir-bar { padding:8px 14px; background:white; border-top:1px solid var(--gray-200); font-size:12px; }
      .rb-tab { padding:6px 12px; border:none; background:none; cursor:pointer; font-size:12px; font-weight:600; color:var(--gray-500); border-bottom:2px solid transparent; }
      .rb-tab.active { color:#4285F4; border-bottom-color:#4285F4; }
      .rb-addr-edit { display:flex; gap:4px; margin-top:4px; position:relative; }
      .rb-addr-input { font-size:11px; padding:4px 8px; border:1px solid #93C5FD; border-radius:6px; flex:1; min-width:0; outline:none; box-shadow:0 0 0 3px rgba(66,133,244,0.1); }
      .rb-autocomplete { position:absolute; top:100%; left:0; right:40px; background:white; border:1px solid #D1D5DB; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:100; max-height:200px; overflow-y:auto; margin-top:2px; }
      .rb-ac-item { padding:8px 10px; font-size:11px; cursor:pointer; border-bottom:1px solid #F3F4F6; }
      .rb-ac-item:hover { background:#EFF6FF; }
      .rb-ac-item:last-child { border-bottom:none; }
      .rb-ac-main { font-weight:600; color:var(--navy); }
      .rb-ac-sub { color:var(--gray-500); font-size:10px; }
      .rb-config-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }
      .rb-config-label { font-size:10px; color:var(--gray-500); font-weight:600; white-space:nowrap; }
      .rb-config-input { font-size:11px; padding:3px 6px; border:1px solid #D1D5DB; border-radius:4px; width:60px; }
      @media (max-width:900px) { .rb-container { flex-direction:column; height:auto; } .rb-left { width:100%; max-width:100%; min-width:0; max-height:50vh; } }
    </style>

    <div class="rb-container">
      <!-- LEFT: Stops & Orders Panel -->
      <div class="rb-left">
        <div class="rb-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:150px">
            <div style="font-weight:800;font-size:15px;color:var(--navy);display:flex;align-items:center;gap:6px"><i class="fab fa-google" style="color:#4285F4"></i> Route Builder</div>
          </div>
          <select class="form-select" id="rbDate" style="width:auto;font-size:12px;padding:4px 8px">
            <option value="${dayjs().format('YYYY-MM-DD')}">Today - ${dayjs().format('MMM D')}</option>
            <option value="${dayjs().add(1,'day').format('YYYY-MM-DD')}">Tomorrow - ${dayjs().add(1,'day').format('MMM D')}</option>
            <option value="${dayjs().add(2,'day').format('YYYY-MM-DD')}">${dayjs().add(2,'day').format('ddd, MMM D')}</option>
          </select>
        </div>

        <!-- Tabs: Stops / Orders & Routes -->
        <div style="display:flex;border-bottom:1px solid var(--gray-200);background:white">
          <button class="rb-tab active" id="rbTabStops" onclick="rbSwitchTab('stops')"><i class="fas fa-route" style="margin-right:4px"></i>Route <span id="rbStopCount" style="background:#4285F4;color:white;padding:1px 6px;border-radius:10px;font-size:10px;margin-left:4px">0</span></button>
          <button class="rb-tab" id="rbTabOrders" onclick="rbSwitchTab('orders')"><i class="fas fa-clipboard-list" style="margin-right:4px"></i>Orders & Routes <span id="rbOrdersCount" style="background:#E5E7EB;color:var(--gray-600);padding:1px 6px;border-radius:10px;font-size:10px;margin-left:4px">${availOrders.length + activeRoutes.length}</span></button>
        </div>

        <!-- Stops List Panel -->
        <div id="rbStopsPanel" class="rb-stops-panel">
          <div id="rbStopsList">
            ${rbRenderStopsList()}
          </div>
        </div>

        <!-- Orders & Routes List Panel (hidden by default) -->
        <div id="rbOrdersPanel" class="rb-orders-panel" style="display:none">
          <div style="padding:8px 12px;border-bottom:1px solid var(--gray-200);background:white;position:sticky;top:0;z-index:2">
            <input type="text" class="form-input" id="rbOrderSearch" placeholder="Search orders, routes, addresses..." oninput="rbFilterOrders()" style="font-size:12px;padding:6px 10px">
          </div>
          <div id="rbOrdersList">
            ${rbRenderOrdersList(availOrders)}
          </div>
        </div>

        <!-- Route Config & Submit -->
        <div class="rb-summary">
          <div class="rb-config-row">
            <select class="form-select" id="rbDriver" style="flex:1;font-size:11px;padding:4px 6px">
              <option value="">Driver...</option>
              ${drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            </select>
            <select class="form-select" id="rbTruck" style="flex:1;font-size:11px;padding:4px 6px">
              <option value="">Truck...</option>
              ${trucks.map(t => `<option value="${t.id}">${t.name} (${t.max_pallet_spots||12}p)</option>`).join('')}
            </select>
          </div>
          <div class="rb-config-row">
            <span class="rb-config-label"><i class="fas fa-clock"></i> Depart:</span>
            <input type="time" class="rb-config-input" id="rbDepartTime" value="06:00" onchange="window._rb.departureTime=this.value;rbRefreshUI()">
            <span class="rb-config-label"><i class="fas fa-stopwatch"></i> Stop time:</span>
            <input type="number" class="rb-config-input" id="rbStopMins" value="10" min="1" max="60" onchange="window._rb.stopMinutes=parseInt(this.value)||10;rbRefreshUI()">
            <span style="font-size:10px;color:var(--gray-400)">min/stop</span>
          </div>
          <div id="rbRouteSummary" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
            <span style="font-size:12px;color:var(--gray-500)">Add orders to build your route</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="navigate('routes')" title="Back to routes"><i class="fas fa-arrow-left"></i></button>
            <button class="btn btn-sm" style="flex:1;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700" id="rbAiBtn" onclick="rbAiSuggest()" title="AI recommends groupings based on your past routes"><i class="fas fa-brain"></i> AI Suggest</button>
            <button class="btn btn-sm" style="flex:1;background:#34A853;color:white;font-weight:700" id="rbOptBtn" onclick="rbOptimizeRoute()" disabled title="Google will find the fastest order"><i class="fas fa-wand-magic-sparkles"></i> Optimize</button>
            <button class="btn btn-sm" style="flex:1;background:#4285F4;color:white;font-weight:700" id="rbCalcBtn" onclick="rbCalculateRoute()" disabled><i class="fas fa-directions"></i> Calculate</button>
            <button class="btn btn-primary btn-sm" style="flex:1" id="rbCreateBtn" onclick="rbSubmitRoute()" disabled><i class="fas fa-check"></i> Create</button>
          </div>
        </div>
      </div>

      <!-- RIGHT: Google Map + Directions -->
      <div class="rb-right">
        <div class="rb-map" id="rbMap" style="flex:1;min-height:0"></div>
        <div class="rb-dir-bar" id="rbDirectionsBar" style="display:none">
          <div id="rbDirSummary"></div>
          <button onclick="rbToggleDirectionsPanel()" id="rbDirToggle" style="margin-top:6px;background:none;border:1px solid #D1D5DB;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;color:#4285F4;cursor:pointer;display:flex;align-items:center;gap:4px;width:100%">
            <i class="fas fa-route"></i> Turn-by-Turn Directions <i class="fas fa-chevron-down" id="rbDirChevron"></i>
          </button>
        </div>
        <div id="rbDirectionsPanel" style="display:none;max-height:40vh;overflow-y:auto;border-top:1px solid #E5E7EB;background:#FAFBFC;font-size:12px"></div>
      </div>
    </div>`;

  // Initialize Google Map
  setTimeout(() => rbInitMap(), 100);

  // Auto-apply cloned template if coming from Learning Dashboard
  if (window._clonedTemplate) {
    const tmpl = window._clonedTemplate;
    window._clonedTemplate = null;
    setTimeout(() => {
      let added = 0;
      for (const oid of (tmpl.order_ids || [])) {
        const order = availOrders.find(o => o.id === oid);
        if (order && !window._rb.stops.find(s => s.type === 'order' && s.id === oid)) {
          const addr = `${order.street || ''}, ${order.city || ''} FL`;
          window._rb.stops.push({
            type: 'order', id: order.id, name: order.business_name,
            order_number: order.order_number, address: addr, originalAddress: addr,
            lat: order.lat, lng: order.lng,
            item_count: order.item_count || 0, pallet_count: order.pallet_count || 0,
            priority: order.priority, gate_code: order.gate_code, leg: null
          });
          added++;
        }
      }
      if (tmpl.truck_id) { const sel = document.getElementById('rbTruck'); if (sel) sel.value = tmpl.truck_id; }
      if (tmpl.driver_id) { const sel = document.getElementById('rbDriver'); if (sel) sel.value = tmpl.driver_id; }
      if (added > 0) {
        window._rb.directions = null;
        rbRefreshUI();
        rbSwitchTab('stops');
        showToast(`Template applied: ${added} orders added to route`, 'success');
      }
    }, 300);
  }
}

function rbSwitchTab(tab) {
  document.getElementById('rbTabStops').classList.toggle('active', tab === 'stops');
  document.getElementById('rbTabOrders').classList.toggle('active', tab === 'orders');
  document.getElementById('rbStopsPanel').style.display = tab === 'stops' ? '' : 'none';
  document.getElementById('rbOrdersPanel').style.display = tab === 'orders' ? '' : 'none';
}

// Compute estimated arrival times for each stop
function rbComputeETAs() {
  const stops = window._rb.stops;
  const depParts = (window._rb.departureTime || '06:00').split(':');
  let cumMinutes = parseInt(depParts[0]) * 60 + parseInt(depParts[1] || 0);
  const stopMins = window._rb.stopMinutes || 10;

  stops.forEach((s, i) => {
    s._etaMinutes = cumMinutes;
    const h = Math.floor(cumMinutes / 60) % 24;
    const m = cumMinutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    s._eta = `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
    // Add drive time to next stop
    if (s.leg && s.leg.duration_value) {
      cumMinutes += Math.round(s.leg.duration_value / 60);
    }
    // Add stop time (loading/unloading)
    cumMinutes += stopMins;
  });
  // Return-to-depot ETA
  window._rb._returnEta = (() => {
    const h = Math.floor(cumMinutes / 60) % 24;
    const m = cumMinutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  })();
  window._rb._totalMinutes = cumMinutes - (parseInt(depParts[0]) * 60 + parseInt(depParts[1] || 0));
}

function rbRenderStopsList() {
  const stops = window._rb.stops;
  rbComputeETAs();

  if (stops.length === 0) {
    return `<div style="text-align:center;padding:40px 20px;color:var(--gray-400)">
      <i class="fas fa-map-location-dot" style="font-size:32px;margin-bottom:12px;color:#D1D5DB"></i>
      <div style="font-weight:700;font-size:14px;color:var(--gray-500)">No stops yet</div>
      <div style="font-size:12px;margin-top:6px">Switch to <strong>Orders</strong> tab and click orders to add them as stops</div>
      <div style="font-size:11px;margin-top:4px;color:var(--gray-400)">Drag stops to reorder them</div>
    </div>`;
  }
  // Depot start
  let html = `<div class="rb-stop-item rb-depot" style="background:#F0F9FF;border-bottom:none;padding:8px 12px">
    <div class="rb-stop-num" style="background:#1E3A8A"><i class="fas fa-warehouse" style="font-size:9px"></i></div>
    <div class="rb-stop-info">
      <div class="rb-stop-name" style="font-size:12px">BF Distribution Center</div>
      <div style="font-size:10px;color:var(--gray-400)">100 Aldi Way, Ste 400, West Palm Beach, FL 33411</div>
    </div>
    <div style="font-size:10px;font-weight:700;color:#1E3A8A;white-space:nowrap">${window._rb.departureTime ? (() => { const p=(window._rb.departureTime||'06:00').split(':'); const h=parseInt(p[0]); const ampm=h>=12?'PM':'AM'; return `${h%12||12}:${p[1]} ${ampm}`; })() : '6:00 AM'}</div>
  </div>`;

  stops.forEach((s, i) => {
    const isReturn = s.type === 'return';
    const bgColor = isReturn ? '#7C3AED' : '#F97316';
    const geoIcon = s.lat && s.lng ? '<i class="fas fa-check-circle" style="color:#059669;font-size:8px" title="Geocoded"></i>' : '<i class="fas fa-exclamation-triangle" style="color:#D97706;font-size:8px" title="No coordinates — click address to fix"></i>';

    // Travel time bar between stops
    const leg = s.leg;
    if (leg) {
      html += `<div class="rb-leg-bar">
        <div class="rb-leg-line active"></div>
        <i class="fas fa-car" style="color:#4285F4;font-size:8px"></i>
        <span style="color:#4285F4;font-weight:700">${leg.duration || ''}</span>
        <span style="color:#9CA3AF">${leg.distance || ''}</span>
      </div>`;
    } else if (i > 0 || stops.length > 0) {
      html += `<div class="rb-leg-bar">
        <div class="rb-leg-line"></div>
        <span style="color:#D1D5DB;font-style:italic">click Calculate</span>
      </div>`;
    }

    html += `<div class="rb-stop-item" data-stop-idx="${i}" draggable="true" ondragstart="rbDragStart(event,${i})" ondragover="rbDragOver(event,${i})" ondragleave="rbDragLeave(event)" ondrop="rbDrop(event,${i})" onclick="rbFocusStop(${i})">
      <div class="rb-stop-num" style="background:${bgColor}">${isReturn ? '<i class="fas fa-rotate-left" style="font-size:9px"></i>' : (i + 1)}</div>
      <div class="rb-stop-info">
        <div class="rb-stop-name">${geoIcon} ${escapeHtml(s.name)} ${isReturn ? '<span style="font-size:9px;background:#EDE9FE;color:#7C3AED;padding:1px 4px;border-radius:3px">PICKUP</span>' : ''}${s.order_number ? ' <span style="font-size:9px;color:var(--gray-400)">'+s.order_number+'</span>' : ''}</div>
        <div class="rb-stop-addr" id="rbStopAddr${i}" onclick="event.stopPropagation();rbEditAddress(${i})" title="Click to edit address">${escapeHtml(s.address)}</div>
        ${s._eta ? `<div class="rb-stop-eta"><i class="fas fa-clock" style="font-size:8px"></i> ETA ${s._eta}</div>` : ''}
        <div id="rbAddrEdit${i}" style="display:none" class="rb-addr-edit">
          <input class="rb-addr-input" id="rbAddrInput${i}" value="${escapeHtml(s.address)}" placeholder="Type address... (Google autocomplete)" oninput="rbAutocomplete(${i})" onkeydown="rbAddrKeydown(event,${i})">
          <button class="btn btn-sm" style="padding:2px 8px;font-size:10px;background:#4285F4;color:white;border-radius:4px" onclick="event.stopPropagation();rbSaveAddress(${i})"><i class="fas fa-check"></i></button>
          <button class="btn btn-outline btn-sm" style="padding:2px 6px;font-size:10px;border-radius:4px" onclick="event.stopPropagation();rbCancelAddrEdit(${i})"><i class="fas fa-times"></i></button>
          <div class="rb-autocomplete" id="rbAC${i}" style="display:none"></div>
        </div>
      </div>
      <div class="rb-stop-actions">
        <button class="rb-stop-btn" onclick="event.stopPropagation();rbMoveStop(${i},-1)" title="Move up" ${i === 0 ? 'disabled style="opacity:0.3"' : ''}><i class="fas fa-chevron-up"></i></button>
        <button class="rb-stop-btn" onclick="event.stopPropagation();rbMoveStop(${i},1)" title="Move down" ${i === stops.length - 1 ? 'disabled style="opacity:0.3"' : ''}><i class="fas fa-chevron-down"></i></button>
        <button class="rb-stop-btn" onclick="event.stopPropagation();rbRemoveStop(${i})" title="Remove" style="color:#DC2626"><i class="fas fa-trash" style="font-size:9px"></i></button>
      </div>
    </div>`;
  });

  // Return-to-depot leg
  if (stops.length > 0 && window._rb.directions?.legs) {
    const lastLeg = window._rb.directions.legs[window._rb.directions.legs.length - 1];
    if (lastLeg) {
      html += `<div class="rb-leg-bar">
        <div class="rb-leg-line active"></div>
        <i class="fas fa-car" style="color:#4285F4;font-size:8px"></i>
        <span style="color:#4285F4;font-weight:700">${lastLeg.duration?.text || ''}</span>
        <span style="color:#9CA3AF">${lastLeg.distance?.text || ''}</span>
      </div>`;
    }
  }

  // Depot return
  html += `<div class="rb-stop-item rb-depot" style="background:#F0F9FF;padding:8px 12px">
    <div class="rb-stop-num" style="background:#1E3A8A"><i class="fas fa-warehouse" style="font-size:9px"></i></div>
    <div class="rb-stop-info">
      <div class="rb-stop-name" style="font-size:12px">Return to Depot</div>
      ${window._rb._returnEta && window._rb.directions ? `<div class="rb-stop-eta"><i class="fas fa-flag-checkered" style="font-size:8px"></i> ETA ${window._rb._returnEta}</div>` : ''}
    </div>
  </div>`;

  return html;
}

function rbRenderOrdersList(orders) {
  const addedIds = new Set(window._rb.stops.filter(s => s.type === 'order').map(s => s.id));
  const addedRetIds = new Set(window._rb.stops.filter(s => s.type === 'return').map(s => s.id));
  const returns = window._rb.returns || [];
  const activeRoutes = window._rb.activeRoutes || [];
  const scheduledOrders = window._rb.scheduledOrders || [];
  const allReturns = window._rb.allReturns || [];

  let html = '';

  // ======= SECTION 1: Unrouted Orders (Available to Add) =======
  html += `<div class="rb-section-header" style="padding:8px 14px;background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-bottom:1px solid #BBF7D0;font-weight:700;font-size:11px;color:#166534;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="rbToggleSection('rbUnrouted')">
    <span><i class="fas fa-exclamation-circle" style="margin-right:4px;color:#DC2626"></i>Unrouted Orders <span style="background:#DC262620;color:#DC2626;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px">${orders.length}</span></span>
    <i class="fas fa-chevron-down rb-section-chev" id="rbUnroutedChev" style="font-size:10px;color:#6B7280;transition:transform 0.2s"></i>
  </div>`;
  html += `<div id="rbUnrouted">`;
  if (orders.length === 0) {
    html += '<div style="padding:16px;text-align:center;color:var(--gray-400);font-size:12px"><i class="fas fa-check-circle" style="color:#059669;margin-right:4px"></i>All orders are on routes</div>';
  }
  orders.forEach(o => {
    const isAdded = addedIds.has(o.id);
    const hasCoords = o.lat && o.lng;
    const addr = `${o.street || ''}, ${o.city || ''} ${o.state || 'FL'} ${o.zip || ''}`.trim();
    html += `<div class="rb-order-item ${isAdded ? 'added' : ''}" onclick="${isAdded ? '' : `rbAddOrder(${o.id})`}" data-search="${(o.order_number + ' ' + o.business_name + ' ' + addr).toLowerCase()}" data-section="unrouted">
      <div style="width:28px;height:28px;border-radius:50%;background:${isAdded ? '#D1D5DB' : '#059669'};color:white;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">${isAdded ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px;color:var(--navy)">${o.order_number} — ${escapeHtml(o.business_name)}</div>
        <div style="font-size:11px;color:var(--gray-500)">${escapeHtml(addr)}</div>
        <div style="font-size:10px;color:var(--gray-400);display:flex;gap:8px;margin-top:2px">
          <span>${o.item_count || 0} units / ${o.pallet_count || 0}p</span>
          ${!hasCoords ? '<span style="color:#D97706"><i class="fas fa-exclamation-triangle"></i> No GPS</span>' : ''}
          ${o.scheduled_date ? `<span><i class="fas fa-calendar"></i> ${dayjs(o.scheduled_date).format('MMM D')}</span>` : ''}
        </div>
        <div id="learning-hint-${o.id}" style="display:none"></div>
      </div>
      ${priorityBadge(o.priority)}
    </div>`;
  });
  html += `</div>`;

  // Load learning hints for unrouted orders
  setTimeout(() => loadOrderLearningHints(orders.map(o => o.id)), 300);

  // ======= SECTION 2: Returns Pending Pickup =======
  if (allReturns.length > 0) {
    const unroutedRets = allReturns.filter(r => !r.route_id);
    const routedRets = allReturns.filter(r => r.route_id);
    html += `<div class="rb-section-header" style="padding:8px 14px;background:linear-gradient(135deg,#FAF5FF,#F3E8FF);border-bottom:1px solid #EDE9FE;font-weight:700;font-size:11px;color:#7C3AED;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="rbToggleSection('rbReturns')">
      <span><i class="fas fa-rotate-left" style="margin-right:4px"></i>Returns <span style="background:#EDE9FE;color:#7C3AED;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px">${allReturns.length}</span>${unroutedRets.length > 0 ? `<span style="background:#FEE2E2;color:#DC2626;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px">${unroutedRets.length} unrouted</span>` : ''}</span>
      <i class="fas fa-chevron-down rb-section-chev" id="rbReturnsChev" style="font-size:10px;color:#6B7280;transition:transform 0.2s"></i>
    </div>`;
    html += `<div id="rbReturns">`;
    allReturns.forEach(r => {
      const isAdded = addedRetIds.has(r.id);
      const isOnRoute = !!r.route_id;
      html += `<div class="rb-order-item ${isAdded ? 'added' : ''}" onclick="${isAdded ? '' : `rbAddReturn(${r.id})`}" data-search="${('return ' + r.business_name + ' ' + (r.street||'') + ' ' + (r.city||'')).toLowerCase()}" data-section="returns" style="${isOnRoute && !isAdded ? 'background:#F5F3FF;' : ''}">
        <div style="width:28px;height:28px;border-radius:50%;background:${isAdded ? '#D1D5DB' : isOnRoute ? '#A78BFA' : 'linear-gradient(135deg,#7C3AED,#5B21B6)'};color:white;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">${isAdded ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12px;color:#7C3AED;display:flex;align-items:center;gap:4px">Return #${r.id} — ${escapeHtml(r.business_name)}${isOnRoute ? '<span style="font-size:9px;background:#DBEAFE;color:#1D4ED8;padding:1px 5px;border-radius:3px"><i class="fas fa-route"></i> On Route</span>' : ''}</div>
          <div style="font-size:11px;color:var(--gray-500)">${r.street || ''}, ${r.city || ''}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ======= SECTION 3: Active Routes with Stops =======
  if (activeRoutes.length > 0) {
    // Group routes by date
    const routesByDate = {};
    activeRoutes.forEach(rt => {
      const d = rt.date || 'No Date';
      if (!routesByDate[d]) routesByDate[d] = [];
      routesByDate[d].push(rt);
    });
    const sortedDates = Object.keys(routesByDate).sort((a, b) => b.localeCompare(a));

    html += `<div class="rb-section-header" style="padding:8px 14px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-bottom:1px solid #93C5FD;font-weight:700;font-size:11px;color:#1D4ED8;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="rbToggleSection('rbActiveRoutes')">
      <span><i class="fas fa-route" style="margin-right:4px"></i>Active Routes <span style="background:#DBEAFE;color:#1D4ED8;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px">${activeRoutes.length} routes</span> <span style="background:#E5E7EB;color:#6B7280;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:2px">${activeRoutes.reduce((s,r) => s + (r.stop_count||0), 0)} stops</span></span>
      <i class="fas fa-chevron-down rb-section-chev" id="rbActiveRoutesChev" style="font-size:10px;color:#6B7280;transition:transform 0.2s"></i>
    </div>`;
    html += `<div id="rbActiveRoutes">`;

    sortedDates.forEach(date => {
      const dateLabel = date === dayjs().format('YYYY-MM-DD') ? 'Today' : date === dayjs().add(1,'day').format('YYYY-MM-DD') ? 'Tomorrow' : formatDate(date);
      html += `<div style="padding:4px 14px;background:#F1F5F9;border-bottom:1px solid #E2E8F0;font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-calendar-day" style="margin-right:4px"></i>${dateLabel} — ${date}</div>`;

      routesByDate[date].forEach(rt => {
        const stops = rt.stops || [];
        const retStops = rt.return_stops || [];
        const allStops = [...stops, ...retStops].sort((a,b) => (a.sequence||0) - (b.sequence||0));
        const truckIcon = rt.truck_type === 'bale' ? 'fa-truck-pickup' : 'fa-truck';
        const truckBadge = rt.truck_type === 'bale'
          ? '<span style="font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;background:#FEF3C7;color:#92400E;margin-left:3px">SM</span>'
          : '<span style="font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;background:#DBEAFE;color:#1D4ED8;margin-left:3px">BIG</span>';

        html += `<div style="border-bottom:1px solid #E5E7EB" data-search="${(rt.route_number + ' ' + (rt.driver_name||'') + ' ' + (rt.truck_name||'')).toLowerCase()}" data-section="routes">
          <div style="padding:8px 14px;background:white;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="rbToggleRouteStops('rbRoute${rt.id}')">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#2563EB,#1D4ED8);color:white;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0"><i class="fas fa-route"></i></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:12px;color:var(--navy);display:flex;align-items:center;gap:4px;flex-wrap:wrap">${escapeHtml(rt.route_number || 'Route #'+rt.id)}${truckBadge}${routeStatusBadge(rt.status)}</div>
              <div style="font-size:10px;color:var(--gray-500);display:flex;gap:8px;flex-wrap:wrap">
                <span><i class="fas fa-map-pin"></i> ${rt.stop_count || 0} stops</span>
                <span><i class="fas fa-box"></i> ${rt.total_items || 0} units</span>
                <span><i class="fas fa-pallet"></i> ${rt.total_pallets || 0}p</span>
                ${rt.driver_name ? `<span><i class="fas fa-user"></i> ${rt.driver_name}</span>` : '<span style="color:#D97706"><i class="fas fa-user-slash"></i> No driver</span>'}
                ${rt.truck_name ? `<span><i class="fas ${truckIcon}"></i> ${rt.truck_name}</span>` : ''}
                ${rt.total_miles ? `<span><i class="fas fa-road"></i> ${rt.total_miles} mi</span>` : ''}
              </div>
            </div>
            <i class="fas fa-chevron-right" style="font-size:10px;color:var(--gray-400);transition:transform 0.2s" id="rbRoute${rt.id}Chev"></i>
          </div>
          <div id="rbRoute${rt.id}" style="display:none;background:#F8FAFC">
            ${allStops.length === 0 ? '<div style="padding:10px 14px 10px 50px;font-size:11px;color:var(--gray-400)">No stops</div>' : ''}
            ${allStops.map((s, si) => {
              const isReturn = !!s.return_id;
              const stopOrderId = s.order_id;
              const isAlreadyAdded = isReturn ? addedRetIds.has(s.return_id) : addedIds.has(stopOrderId);
              const addr = `${s.street || ''}, ${s.city || ''} ${s.state || 'FL'} ${s.zip || ''}`.trim();
              const searchStr = ((s.order_number||'') + ' ' + (s.business_name||'') + ' ' + addr).toLowerCase();
              const clickFn = isAlreadyAdded ? '' : isReturn
                ? `rbAddRouteStop(${rt.id},${s.return_id},'return')`
                : `rbAddRouteStop(${rt.id},${stopOrderId},'order')`;
              return `<div class="rb-order-item ${isAlreadyAdded ? 'added' : ''}" style="padding:6px 14px 6px 24px;${isReturn ? 'background:#FEFCE8;' : ''}" data-search="${searchStr}" data-section="routes" onclick="${clickFn}">
                <div style="width:20px;height:20px;border-radius:50%;background:${isAlreadyAdded ? '#D1D5DB' : isReturn ? '#F59E0B' : '#3B82F6'};color:white;display:flex;align-items:center;justify-content:center;font-size:8px;flex-shrink:0">${isAlreadyAdded ? '<i class="fas fa-check"></i>' : isReturn ? '<i class="fas fa-rotate-left"></i>' : (si + 1)}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:11px;color:${isReturn ? '#92400E' : 'var(--navy)'}">${isReturn ? 'RETURN: ' : ''}${escapeHtml(s.order_number || '')} ${escapeHtml(s.business_name || '')}</div>
                  <div style="font-size:10px;color:var(--gray-400)">${escapeHtml(addr)}${!isReturn && s.item_count ? ` — ${s.item_count} units / ${s.pallet_count || 0}p` : ''}</div>
                </div>
                ${!isAlreadyAdded ? '<div style="font-size:9px;color:#2563EB;font-weight:700;white-space:nowrap"><i class="fas fa-plus"></i> Add</div>' : ''}
              </div>`;
            }).join('')}
            <div style="padding:4px 14px 6px 24px;display:flex;gap:4px">
              <button class="btn btn-sm" style="font-size:10px;padding:3px 8px;background:#2563EB;color:white;font-weight:700;border-radius:4px" onclick="rbAddAllFromRoute(${rt.id})" title="Add all stops from this route"><i class="fas fa-plus-circle"></i> Add All Stops</button>
              <button class="btn btn-sm btn-outline" style="font-size:10px;padding:3px 8px;border-radius:4px" onclick="navigate('routes',{viewId:${rt.id}})"><i class="fas fa-eye"></i> View Route</button>
            </div>
          </div>
        </div>`;
      });
    });
    html += `</div>`;
  }

  // ======= SECTION 4: Scheduled/In-Progress Orders (already on routes) =======
  if (scheduledOrders.length > 0) {
    html += `<div class="rb-section-header" style="padding:8px 14px;background:linear-gradient(135deg,#FFF7ED,#FED7AA);border-bottom:1px solid #FDBA74;font-weight:700;font-size:11px;color:#9A3412;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="rbToggleSection('rbScheduled')">
      <span><i class="fas fa-clock" style="margin-right:4px"></i>Scheduled / In-Progress <span style="background:#FED7AA;color:#9A3412;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px">${scheduledOrders.length}</span></span>
      <i class="fas fa-chevron-right rb-section-chev" id="rbScheduledChev" style="font-size:10px;color:#6B7280;transition:transform 0.2s"></i>
    </div>`;
    html += `<div id="rbScheduled" style="display:none">`;
    scheduledOrders.forEach(o => {
      const addr = `${o.street || ''}, ${o.city || ''} ${o.state || 'FL'} ${o.zip || ''}`.trim();
      html += `<div class="rb-order-item" style="opacity:0.7" data-search="${(o.order_number + ' ' + o.business_name + ' ' + addr).toLowerCase()}" data-section="scheduled" onclick="navigate('orders',{viewId:${o.id}})">
        <div style="width:28px;height:28px;border-radius:50%;background:#F59E0B;color:white;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0"><i class="fas fa-clock"></i></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12px;color:var(--navy);display:flex;align-items:center;gap:4px">${o.order_number} — ${escapeHtml(o.business_name)} ${statusBadge(o.status)}</div>
          <div style="font-size:11px;color:var(--gray-500)">${escapeHtml(addr)}</div>
          <div style="font-size:10px;color:var(--gray-400);display:flex;gap:8px;margin-top:2px">
            <span>${o.item_count || 0} units / ${o.pallet_count || 0}p</span>
            ${o.route_number ? `<span><i class="fas fa-route"></i> ${o.route_number}</span>` : ''}
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  return html;
}

// Toggle section visibility in Orders tab
function rbToggleSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  const chevron = document.getElementById(sectionId + 'Chev');
  if (el.style.display === 'none') {
    el.style.display = '';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  } else {
    el.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(-90deg)';
  }
}

// Toggle route stops expansion
function rbToggleRouteStops(routeElId) {
  const el = document.getElementById(routeElId);
  if (!el) return;
  const chevron = document.getElementById(routeElId + 'Chev');
  if (el.style.display === 'none') {
    el.style.display = '';
    if (chevron) chevron.style.transform = 'rotate(90deg)';
  } else {
    el.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}

// Add an order or return stop from an existing route into the builder (safe — no string escaping issues)
function rbAddRouteStop(routeId, stopId, stopType) {
  const route = (window._rb.activeRoutes || []).find(r => r.id === routeId);
  if (!route) { showToast('Route not found', 'error'); return; }

  if (stopType === 'return') {
    const s = (route.return_stops || []).find(x => x.return_id === stopId);
    if (!s) { showToast('Return stop not found', 'error'); return; }
    if (window._rb.stops.find(x => x.type === 'return' && x.id === stopId)) {
      showToast('Already added', 'warning'); return;
    }
    const addr = `${s.street || ''}, ${s.city || ''} ${s.state || 'FL'} ${s.zip || ''}`.trim();
    window._rb.stops.push({
      type: 'return', id: stopId, name: s.business_name || '',
      address: addr, originalAddress: addr,
      lat: s.lat, lng: s.lng,
      item_count: 0, pallet_count: 0, leg: null
    });
    window._rb.directions = null;
    rbRefreshUI(); rbSwitchTab('stops');
    showToast(`Added Return — ${s.business_name || 'Return #'+stopId}`, 'success');
    rbAutoCalcDebounced();
  } else {
    const s = (route.stops || []).find(x => x.order_id === stopId);
    if (!s) { showToast('Order stop not found', 'error'); return; }
    if (window._rb.stops.find(x => x.type === 'order' && x.id === stopId)) {
      showToast('Already added', 'warning'); return;
    }
    const addr = `${s.street || ''}, ${s.city || ''} ${s.state || 'FL'} ${s.zip || ''}`.trim();
    window._rb.stops.push({
      type: 'order', id: stopId, name: s.business_name || '', order_number: s.order_number || '',
      address: addr, originalAddress: addr,
      lat: s.lat, lng: s.lng,
      item_count: s.item_count || 0, pallet_count: s.pallet_count || 0,
      priority: s.priority || 'normal', leg: null
    });
    window._rb.directions = null;
    rbRefreshUI(); rbSwitchTab('stops');
    showToast(`Added ${s.order_number || ''} — ${s.business_name || ''}`, 'success');
    rbAutoCalcDebounced();
  }
}

// Add all stops from an existing route
function rbAddAllFromRoute(routeId) {
  const route = (window._rb.activeRoutes || []).find(r => r.id === routeId);
  if (!route) return;
  let added = 0;
  const stops = route.stops || [];
  const retStops = route.return_stops || [];

  stops.forEach(s => {
    if (!s.order_id || window._rb.stops.find(x => x.type === 'order' && x.id === s.order_id)) return;
    const addr = `${s.street || ''}, ${s.city || ''} ${s.state || 'FL'} ${s.zip || ''}`.trim();
    window._rb.stops.push({
      type: 'order', id: s.order_id, name: s.business_name, order_number: s.order_number,
      address: addr, originalAddress: addr,
      lat: s.lat, lng: s.lng,
      item_count: s.item_count || 0, pallet_count: s.pallet_count || 0,
      priority: s.priority || 'normal', leg: null
    });
    added++;
  });

  retStops.forEach(s => {
    if (!s.return_id || window._rb.stops.find(x => x.type === 'return' && x.id === s.return_id)) return;
    const addr = `${s.street || ''}, ${s.city || ''} ${s.state || 'FL'} ${s.zip || ''}`.trim();
    window._rb.stops.push({
      type: 'return', id: s.return_id, name: s.business_name,
      address: addr, originalAddress: addr,
      lat: s.lat, lng: s.lng,
      item_count: 0, pallet_count: 0,
      leg: null
    });
    added++;
  });

  if (added > 0) {
    window._rb.directions = null;
    rbRefreshUI();
    rbSwitchTab('stops');
    showToast(`Added ${added} stops from ${route.route_number || 'Route #'+routeId}`, 'success');
    rbAutoCalcDebounced();
  } else {
    showToast('All stops already added', 'warning');
  }
}

function rbFilterOrders() {
  const q = (document.getElementById('rbOrderSearch')?.value || '').toLowerCase();
  // Filter all items with data-search attribute (orders, returns, route stops, route headers)
  document.querySelectorAll('#rbOrdersList [data-search]').forEach(el => {
    const search = el.dataset.search || '';
    el.style.display = !q || search.includes(q) ? '' : 'none';
  });
  // Also show parent route containers if any child matches
  if (q) {
    document.querySelectorAll('#rbOrdersList [id^="rbRoute"]').forEach(el => {
      if (el.id.endsWith('Chev')) return;
      const hasVisible = el.querySelector('[data-search]:not([style*="display: none"])');
      if (hasVisible) {
        el.style.display = '';
        el.closest('[data-section="routes"]')?.style && (el.closest('[data-section="routes"]').style.display = '');
      }
    });
    // Expand all sections when searching
    ['rbUnrouted', 'rbReturns', 'rbActiveRoutes', 'rbScheduled'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
  }
}

function rbAddOrder(orderId) {
  const o = window._rb.orders.find(x => x.id === orderId);
  if (!o) return;
  if (window._rb.stops.find(s => s.type === 'order' && s.id === o.id)) return;
  const addr = `${o.street || ''}, ${o.city || ''} ${o.state || 'FL'} ${o.zip || ''}`.trim();
  window._rb.stops.push({
    type: 'order', id: o.id, name: o.business_name, order_number: o.order_number,
    address: addr, originalAddress: addr,
    lat: o.lat, lng: o.lng,
    item_count: o.item_count || 0, pallet_count: o.pallet_count || 0,
    priority: o.priority, leg: null
  });
  window._rb.directions = null;
  rbRefreshUI();
  rbSwitchTab('stops');
  showToast(`Added ${o.order_number} — ${o.business_name}`, 'success');
  rbAutoCalcDebounced();
}

function rbAddReturn(returnId) {
  const r = window._rb.returns.find(x => x.id === returnId);
  if (!r) return;
  if (window._rb.stops.find(s => s.type === 'return' && s.id === r.id)) return;
  const addr = `${r.street || ''}, ${r.city || ''} FL`;
  const totalQty = (r.items || []).reduce((s, i) => s + (i.expected_qty || 0), 0);
  // Use server-provided pallet_count if available, otherwise compute with grouped logic
  const palletCount = r.pallet_count != null ? r.pallet_count : calcPallets(r.items || []);
  window._rb.stops.push({
    type: 'return', id: r.id, name: r.business_name,
    address: addr, originalAddress: addr,
    lat: r.lat, lng: r.lng,
    item_count: totalQty, pallet_count: Math.max(palletCount, r.items?.length > 0 ? 1 : 0),
    leg: null
  });
  window._rb.directions = null;
  rbRefreshUI();
  rbSwitchTab('stops');
  showToast(`Added Return #${r.id} — ${r.business_name}`, 'success');
  rbAutoCalcDebounced();
}

function rbRemoveStop(idx) {
  window._rb.stops.splice(idx, 1);
  window._rb.directions = null;
  window._rb.stops.forEach(s => s.leg = null);
  rbRefreshUI();
  rbAutoCalcDebounced();
}

function rbMoveStop(idx, dir) {
  const stops = window._rb.stops;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= stops.length) return;
  [stops[idx], stops[newIdx]] = [stops[newIdx], stops[idx]];
  window._rb.directions = null;
  window._rb.stops.forEach(s => s.leg = null);
  rbRefreshUI();
  rbAutoCalcDebounced();
}

// ---- Drag and Drop for reordering ----
function rbDragStart(e, idx) {
  window._rb.dragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', idx);
  setTimeout(() => e.target.classList.add('rb-dragging'), 0);
}

function rbDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget;
  el.classList.add('rb-drag-over');
}

function rbDragLeave(e) {
  e.currentTarget.classList.remove('rb-drag-over');
}

function rbDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('rb-drag-over');
  const srcIdx = window._rb.dragIdx;
  if (srcIdx === null || srcIdx === targetIdx) return;
  const stops = window._rb.stops;
  const [moved] = stops.splice(srcIdx, 1);
  stops.splice(targetIdx, 0, moved);
  window._rb.dragIdx = null;
  window._rb.directions = null;
  window._rb.stops.forEach(s => s.leg = null);
  rbRefreshUI();
  rbAutoCalcDebounced();
}

// ---- Address Autocomplete (client-side Google Maps AutocompleteService) ----
window._rbACTimer = null;
window._rbACService = null;
window._rbPlacesService = null;
window._rbGeocoder = null;

function rbGetACService() {
  if (!window.__gmapsLoaded || !window.google?.maps?.places) return null;
  if (!window._rbACService) window._rbACService = new google.maps.places.AutocompleteService();
  return window._rbACService;
}
function rbGetPlacesService() {
  if (!window.__gmapsLoaded || !window.google?.maps?.places) return null;
  if (!window._rbPlacesService && window._rb.map) {
    window._rbPlacesService = new google.maps.places.PlacesService(window._rb.map);
  }
  return window._rbPlacesService;
}
function rbGetGeocoder() {
  if (!window.__gmapsLoaded || !window.google?.maps) return null;
  if (!window._rbGeocoder) window._rbGeocoder = new google.maps.Geocoder();
  return window._rbGeocoder;
}

function rbAutocomplete(idx) {
  clearTimeout(window._rbACTimer);
  const input = document.getElementById(`rbAddrInput${idx}`);
  const acEl = document.getElementById(`rbAC${idx}`);
  if (!input || !acEl) return;
  const q = input.value.trim();
  if (q.length < 3) { acEl.style.display = 'none'; return; }

  window._rbACTimer = setTimeout(() => {
    const svc = rbGetACService();
    if (!svc) {
      // Fallback: use server-side geocoding for suggestions
      rbAutocompleteFallback(idx, q);
      return;
    }
    const depot = window.__DEPOT || DEPOT;
    svc.getPlacePredictions({
      input: q,
      location: new google.maps.LatLng(depot.lat, depot.lng),
      radius: 80000,
      componentRestrictions: { country: 'us' },
      types: ['address']
    }, (predictions, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
        // Fallback to geocoder
        rbAutocompleteFallback(idx, q);
        return;
      }
      acEl.innerHTML = predictions.map((p, pi) => `<div class="rb-ac-item" onmousedown="rbSelectAC(${idx},${pi})">
        <div class="rb-ac-main">${p.structured_formatting?.main_text || p.description}</div>
        <div class="rb-ac-sub">${p.structured_formatting?.secondary_text || ''}</div>
      </div>`).join('');
      acEl.style.display = '';
      window._rbACPreds = predictions;
      window._rbACMode = 'places';
    });
  }, 300);
}

// Fallback: server-side geocode to get address suggestions
async function rbAutocompleteFallback(idx, q) {
  const acEl = document.getElementById(`rbAC${idx}`);
  if (!acEl) return;
  try {
    const resp = await fetch('/api/maps/geocode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: q })
    });
    const data = await resp.json();
    if (data.status === 'OK' && data.formatted_address) {
      acEl.innerHTML = `<div class="rb-ac-item" onmousedown="rbSelectACGeocode(${idx})">
        <div class="rb-ac-main"><i class="fas fa-map-marker-alt" style="color:#4285F4;margin-right:4px"></i>${data.formatted_address}</div>
        <div class="rb-ac-sub">Google Geocode result (lat: ${data.lat?.toFixed(4)}, lng: ${data.lng?.toFixed(4)})</div>
      </div>`;
      acEl.style.display = '';
      window._rbACGeocodeResult = data;
    } else {
      acEl.style.display = 'none';
    }
  } catch (e) { acEl.style.display = 'none'; }
}

function rbSelectACGeocode(idx) {
  const data = window._rbACGeocodeResult;
  if (!data) return;
  const acEl = document.getElementById(`rbAC${idx}`);
  if (acEl) acEl.style.display = 'none';
  const stop = window._rb.stops[idx];
  stop.address = data.formatted_address;
  stop.lat = data.lat;
  stop.lng = data.lng;
  showToast(`Address verified: ${stop.address}`, 'success');
  rbCancelAddrEdit(idx);
  window._rb.directions = null;
  window._rb.stops.forEach(s => s.leg = null);
  rbRefreshUI();
  rbAutoCalcDebounced();
}

async function rbSelectAC(idx, predIdx) {
  const pred = (window._rbACPreds || [])[predIdx];
  if (!pred) return;
  const acEl = document.getElementById(`rbAC${idx}`);
  if (acEl) acEl.style.display = 'none';
  const input = document.getElementById(`rbAddrInput${idx}`);
  if (input) input.value = pred.description;

  const stop = window._rb.stops[idx];

  // Use client-side PlacesService to get lat/lng from place_id
  const placesService = rbGetPlacesService();
  if (placesService && pred.place_id) {
    try {
      await new Promise((resolve, reject) => {
        placesService.getDetails({ placeId: pred.place_id, fields: ['geometry', 'formatted_address'] }, (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
            stop.lat = place.geometry.location.lat();
            stop.lng = place.geometry.location.lng();
            stop.address = place.formatted_address || pred.description;
            showToast(`Address verified: ${stop.address}`, 'success');
            resolve();
          } else {
            reject(new Error('Place details failed'));
          }
        });
      });
    } catch (e) {
      // Fallback: use server-side geocoding
      try {
        const resp = await fetch('/api/maps/geocode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: pred.description })
        });
        const data = await resp.json();
        if (data.status === 'OK') {
          stop.lat = data.lat;
          stop.lng = data.lng;
          stop.address = data.formatted_address || pred.description;
          showToast(`Address geocoded: ${stop.address}`, 'success');
        } else {
          stop.address = pred.description;
          showToast('Address set (geocoding unavailable)', 'warning');
        }
      } catch (e2) {
        stop.address = pred.description;
        showToast('Address set, geocoding failed', 'warning');
      }
    }
  } else {
    // No places service, use server-side geocoding
    try {
      const resp = await fetch('/api/maps/geocode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: pred.description })
      });
      const data = await resp.json();
      if (data.status === 'OK') {
        stop.lat = data.lat;
        stop.lng = data.lng;
        stop.address = data.formatted_address || pred.description;
        showToast(`Address geocoded: ${stop.address}`, 'success');
      }
    } catch (e) { stop.address = pred.description; }
  }

  rbCancelAddrEdit(idx);
  window._rb.directions = null;
  window._rb.stops.forEach(s => s.leg = null);
  rbRefreshUI();
  rbAutoCalcDebounced();
}

function rbAddrKeydown(e, idx) {
  if (e.key === 'Enter') { e.preventDefault(); rbSaveAddress(idx); }
  if (e.key === 'Escape') { e.preventDefault(); rbCancelAddrEdit(idx); }
}

function rbEditAddress(idx) {
  event?.stopPropagation();
  const editEl = document.getElementById(`rbAddrEdit${idx}`);
  const addrEl = document.getElementById(`rbStopAddr${idx}`);
  if (editEl) editEl.style.display = 'flex';
  if (addrEl) addrEl.style.display = 'none';
  const input = document.getElementById(`rbAddrInput${idx}`);
  if (input) { input.focus(); input.select(); }
}

function rbCancelAddrEdit(idx) {
  const editEl = document.getElementById(`rbAddrEdit${idx}`);
  const addrEl = document.getElementById(`rbStopAddr${idx}`);
  const acEl = document.getElementById(`rbAC${idx}`);
  if (editEl) editEl.style.display = 'none';
  if (addrEl) addrEl.style.display = '';
  if (acEl) acEl.style.display = 'none';
}

async function rbSaveAddress(idx) {
  const input = document.getElementById(`rbAddrInput${idx}`);
  if (!input) return;
  const newAddr = input.value.trim();
  if (!newAddr) { showToast('Address cannot be empty', 'warning'); return; }
  const stop = window._rb.stops[idx];
  stop.address = newAddr;

  // Geocode via server-side proxy (keeps API key hidden)
  showToast('Geocoding address...', 'info');
  try {
    const resp = await fetch('/api/maps/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: newAddr })
    });
    const data = await resp.json();
    if (data.status === 'OK' && data.lat && data.lng) {
      stop.lat = data.lat;
      stop.lng = data.lng;
      stop.address = data.formatted_address || newAddr;
      showToast(`Address geocoded: ${stop.address}`, 'success');
    } else {
      showToast('Could not geocode — coordinates not updated', 'warning');
    }
  } catch (e) { showToast('Geocoding failed — using entered address', 'warning'); }

  rbCancelAddrEdit(idx);
  window._rb.directions = null;
  window._rb.stops.forEach(s => s.leg = null);
  rbRefreshUI();
  rbAutoCalcDebounced();
}

function rbFocusStop(idx) {
  const stop = window._rb.stops[idx];
  if (!stop?.lat || !stop?.lng) return;
  if (window._rb.map) {
    window._rb.map.panTo({ lat: stop.lat, lng: stop.lng });
    window._rb.map.setZoom(16);
    window._rb.map.setMapTypeId(google.maps.MapTypeId.HYBRID);
    // Bounce the marker
    const marker = window._rb.markers[idx];
    if (marker) {
      marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => marker.setAnimation(null), 1500);
    }
  }
  // Highlight stop row
  document.querySelectorAll('.rb-stop-item').forEach(el => el.style.background = '');
  const row = document.querySelector(`[data-stop-idx="${idx}"]`);
  if (row) { row.style.background = '#DBEAFE'; setTimeout(() => row.style.background = '', 2000); }
}

function rbRefreshUI() {
  const stops = window._rb.stops;
  // Update stops list
  const stopsEl = document.getElementById('rbStopsList');
  if (stopsEl) stopsEl.innerHTML = rbRenderStopsList();

  // Update orders list (mark added ones)
  const ordersEl = document.getElementById('rbOrdersList');
  if (ordersEl) ordersEl.innerHTML = rbRenderOrdersList(window._rb.orders);

  // Update stop count badge
  const badge = document.getElementById('rbStopCount');
  if (badge) badge.textContent = stops.length;

  // Update orders+routes count badge
  const ordersCountBadge = document.getElementById('rbOrdersCount');
  if (ordersCountBadge) {
    const totalCtx = (window._rb.orders || []).length + (window._rb.activeRoutes || []).length;
    ordersCountBadge.textContent = totalCtx;
  }

  // Update buttons
  const calcBtn = document.getElementById('rbCalcBtn');
  const createBtn = document.getElementById('rbCreateBtn');
  const optBtn = document.getElementById('rbOptBtn');
  const hasGeo = stops.some(s => s.lat && s.lng);
  if (calcBtn) calcBtn.disabled = stops.length < 1 || !hasGeo;
  if (optBtn) optBtn.disabled = stops.length < 2 || !hasGeo;
  if (createBtn) createBtn.disabled = stops.length < 1;

  // Update summary
  rbUpdateSummary();

  // Update map markers
  rbUpdateMapMarkers();
}

function rbUpdateSummary() {
  const stops = window._rb.stops;
  const el = document.getElementById('rbRouteSummary');
  if (!el) return;

  if (stops.length === 0) {
    el.innerHTML = '<span style="font-size:12px;color:var(--gray-500)">Add orders to build your route</span>';
    return;
  }

  const totalUnits = stops.reduce((s, st) => s + (st.item_count || 0), 0);
  const totalPallets = stops.reduce((s, st) => s + (st.pallet_count || 0), 0);
  const dir = window._rb.directions;
  const totalHrs = window._rb._totalMinutes ? `${Math.floor(window._rb._totalMinutes/60)}h ${window._rb._totalMinutes%60}m` : '';

  el.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:100%">
      <span style="font-size:11px;font-weight:700;color:var(--navy)"><i class="fas fa-map-pin" style="color:#059669"></i> ${stops.length} stops</span>
      <span style="font-size:11px;color:var(--gray-600)"><i class="fas fa-boxes-stacked" style="color:#D97706"></i> ${totalUnits}u / ${totalPallets}p</span>
      ${dir ? `<span style="font-size:11px;font-weight:700;color:#4285F4"><i class="fas fa-road"></i> ${dir.total_distance?.text || ''}</span>
      <span style="font-size:11px;font-weight:700;color:#059669"><i class="fas fa-clock"></i> ${dir.total_duration?.text || ''} drive</span>
      ${totalHrs ? `<span style="font-size:11px;font-weight:600;color:#7C3AED"><i class="fas fa-calendar-day"></i> ${totalHrs} total</span>` : ''}
      <span style="font-size:10px;color:#DC2626"><i class="fas fa-gas-pump"></i> ~${((dir.total_distance?.miles || 0) / 8).toFixed(1)}gal ($${(((dir.total_distance?.miles || 0) / 8) * 4.2).toFixed(0)})</span>` : ''}
    </div>`;
}

function rbInitMap() {
  if (!window.__gmapsLoaded) {
    setTimeout(() => rbInitMap(), 500);
    return;
  }
  const depot = window.__DEPOT || DEPOT;
  const container = document.getElementById('rbMap');
  if (!container) return;

  const map = new google.maps.Map(container, {
    center: { lat: depot.lat, lng: depot.lng },
    zoom: 11,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: 'greedy',
    mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT }
  });
  window._rb.map = map;

  // Native Google Directions service & renderer
  window._rb.directionsService = new google.maps.DirectionsService();
  window._rb.directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true, // We draw our own numbered markers
    preserveViewport: false,
    polylineOptions: {
      strokeColor: '#4285F4',
      strokeOpacity: 0.85,
      strokeWeight: 6
    }
  });

  // Depot marker
  window._rb.depotMarker = new google.maps.Marker({
    position: { lat: depot.lat, lng: depot.lng }, map,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#1E3A8A', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 },
    title: 'BF Distribution Center', zIndex: 2000
  });
  // Depot label
  new google.maps.Marker({
    position: { lat: depot.lat, lng: depot.lng }, map,
    icon: { path: 'M-6,-6 L6,-6 L6,6 L-6,6 Z', scale: 0, fillOpacity: 0, strokeOpacity: 0 },
    label: { text: 'DEPOT', color: '#1E3A8A', fontWeight: '800', fontSize: '10px' },
    zIndex: 2001
  });
}

function rbToggleDirectionsPanel() {
  const panel = document.getElementById('rbDirectionsPanel');
  const chevron = document.getElementById('rbDirChevron');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
}

function rbUpdateMapMarkers() {
  const map = window._rb.map;
  if (!map) return;

  // Clear old markers and manual polylines
  (window._rb.markers || []).forEach(m => m.setMap(null));
  (window._rb.polylines || []).forEach(p => p.setMap(null));
  if (window._rb.polyline) { window._rb.polyline.setMap(null); window._rb.polyline = null; }
  window._rb.markers = [];
  window._rb.polylines = [];

  // If directions were cleared, also clear the DirectionsRenderer
  if (!window._rb.directions && window._rb.directionsRenderer) {
    window._rb.directionsRenderer.setDirections({ routes: [] });
    // Hide directions bar and panel
    const dirBar = document.getElementById('rbDirectionsBar');
    if (dirBar) dirBar.style.display = 'none';
    const dirPanel = document.getElementById('rbDirectionsPanel');
    if (dirPanel) { dirPanel.style.display = 'none'; dirPanel.innerHTML = ''; }
  }

  const depot = window.__DEPOT || DEPOT;
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });

  window._rb.stops.forEach((s, i) => {
    if (!s.lat || !s.lng) return;
    const isReturn = s.type === 'return';
    const color = isReturn ? '#7C3AED' : '#F97316';
    const marker = new google.maps.Marker({
      position: { lat: s.lat, lng: s.lng }, map,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 },
      label: { text: String(i + 1), color: '#FFFFFF', fontWeight: '700', fontSize: '12px' },
      title: `${i+1}. ${s.name}`, zIndex: 100 + i
    });
    const etaStr = s._eta ? `<br><span style="color:#059669;font-weight:700">ETA: ${s._eta}</span>` : '';
    const legStr = s.leg ? `<br><span style="color:#4285F4;font-weight:600"><i class="fas fa-car"></i> ${s.leg.distance} &bull; ${s.leg.duration}</span>` : '';
    const iw = new google.maps.InfoWindow({
      content: `<div style="font-size:12px;max-width:260px"><strong>Stop ${i+1}: ${escapeHtml(s.name)}</strong>${s.order_number ? ' <span style="color:#999">('+s.order_number+')</span>' : ''}<br><span style="color:#666">${escapeHtml(s.address)}</span><br>${s.item_count || 0} units / ${s.pallet_count || 0} pallets${legStr}${etaStr}</div>`
    });
    marker.addListener('click', () => { iw.open(map, marker); rbFocusStop(i); });
    window._rb.markers.push(marker);
    bounds.extend({ lat: s.lat, lng: s.lng });
  });

  // Draw dashed straight-line connections only when no directions are active
  if (!window._rb.directions) {
    const geoStops = window._rb.stops.filter(s => s.lat && s.lng);
    if (geoStops.length > 0) {
      const points = [{ lat: depot.lat, lng: depot.lng }, ...geoStops.map(s => ({ lat: s.lat, lng: s.lng })), { lat: depot.lat, lng: depot.lng }];
      const line = new google.maps.Polyline({
        path: points, geodesic: true, strokeColor: '#9CA3AF', strokeOpacity: 0.5, strokeWeight: 2,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }], map
      });
      window._rb.polylines.push(line);
    }
  }

  if (window._rb.stops.length > 0) {
    map.fitBounds(bounds, { top: 50, bottom: 60, left: 50, right: 50 });
  }
}

// ---- Auto-calculate debounced ----
window._rbAutoCalcTimer = null;
function rbAutoCalcDebounced() {
  if (!window._rb.autoCalc) return;
  clearTimeout(window._rbAutoCalcTimer);
  const geoStops = window._rb.stops.filter(s => s.lat && s.lng);
  if (geoStops.length < 1) return;
  window._rbAutoCalcTimer = setTimeout(() => rbCalculateRoute(), 1200);
}

// ---- Native Google Maps Directions ----
function _rbBuildRequest(optimize) {
  const depot = window.__DEPOT || DEPOT;
  const geoStops = window._rb.stops.filter(s => s.lat && s.lng);
  const origin = new google.maps.LatLng(depot.lat, depot.lng);
  const waypoints = geoStops.map(s => ({
    location: new google.maps.LatLng(s.lat, s.lng),
    stopover: true
  }));
  return {
    origin,
    destination: origin,
    waypoints,
    optimizeWaypoints: !!optimize,
    travelMode: google.maps.TravelMode.DRIVING,
    unitSystem: google.maps.UnitSystem.IMPERIAL,
    provideRouteAlternatives: false
  };
}

function _rbApplyDirectionsResult(result, isOptimize) {
  const route = result.routes[0];
  const legs = route.legs;

  // If optimize, reorder stops to match Google's optimal order
  if (isOptimize && route.waypoint_order) {
    const order = route.waypoint_order;
    const geoIndices = [];
    window._rb.stops.forEach((s, i) => { if (s.lat && s.lng) geoIndices.push(i); });
    const newStops = [];
    const usedIndices = new Set();
    order.forEach(optIdx => {
      const origIdx = geoIndices[optIdx];
      if (origIdx !== undefined) { newStops.push(window._rb.stops[origIdx]); usedIndices.add(origIdx); }
    });
    window._rb.stops.forEach((s, i) => { if (!usedIndices.has(i)) newStops.push(s); });
    window._rb.stops = newStops;
  }

  // Map leg data to stops
  let legIdx = 0;
  let totalDistM = 0, totalDurS = 0;
  window._rb.stops.forEach(s => {
    if (s.lat && s.lng && legs[legIdx]) {
      const leg = legs[legIdx];
      s.leg = {
        distance: leg.distance?.text || '',
        duration: leg.duration?.text || '',
        distance_value: leg.distance?.value || 0,
        duration_value: leg.duration?.value || 0
      };
      totalDistM += leg.distance?.value || 0;
      totalDurS += leg.duration?.value || 0;
      legIdx++;
    }
  });
  // Last leg (return to depot)
  if (legs[legIdx]) {
    totalDistM += legs[legIdx].distance?.value || 0;
    totalDurS += legs[legIdx].duration?.value || 0;
  }

  const totalMiles = (totalDistM * 0.000621371);
  const totalMin = Math.round(totalDurS / 60);
  const totalHrs = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;

  // Store normalized directions data for route creation
  window._rb.directions = {
    total_distance: { text: totalMiles.toFixed(1) + ' mi', miles: totalMiles, value: totalDistM },
    total_duration: { text: (totalHrs > 0 ? totalHrs + ' hr ' : '') + remMin + ' min', minutes: totalMin, value: totalDurS },
    legs: legs.map(l => ({ distance: l.distance, duration: l.duration })),
    warnings: route.warnings || [],
    _nativeResult: result
  };

  // Use DirectionsRenderer for drawing
  const renderer = window._rb.directionsRenderer;
  if (renderer) {
    renderer.setDirections(result);
  }

  // Show directions bar + render summary
  const dirBar = document.getElementById('rbDirectionsBar');
  if (dirBar) dirBar.style.display = '';
  rbRenderDirectionsSummary(window._rb.directions, legs);

  // Render turn-by-turn in panel
  rbRenderTurnByTurn(legs);
}

// ==================== AI ROUTE SUGGESTIONS ====================
async function rbAiSuggest() {
  // Gather all available orders from the orders panel
  const allOrders = window._rb.orders || [];
  if (allOrders.length === 0) { showToast('No available orders to analyze', 'warning'); return; }

  const btn = document.getElementById('rbAiBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking...'; }

  try {
    const dateEl = document.getElementById('rbDate');
    const date = dateEl?.value || dayjs().format('YYYY-MM-DD');
    const orderIds = allOrders.map(o => o.id);

    const { data } = await API.post('/learning/recommend', { date, order_ids: orderIds });

    if (!data.has_learning_data) {
      // No learning data yet — offer to backfill from existing routes
      showAiNoDataModal();
      return;
    }

    showAiRecommendationsModal(data, date);
  } catch (e) {
    console.error('AI Suggest error:', e);
    showToast('AI suggestion failed — not enough route data yet', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-brain"></i> AI Suggest'; }
  }
}

function showAiNoDataModal() {
  // Auto-run backfill silently, then notify user
  showToast('Initializing AI Learning — analyzing past routes...', 'info');
  API.post('/learning/backfill').then(({ data }) => {
    showToast(`AI learned from ${data.routes_processed} routes! Try AI Suggest again.`, 'success');
  }).catch(() => {
    showToast('No route data available yet. Create some routes first, then AI will learn automatically.', 'warning');
  });
}

async function runBackfill(btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...'; }
  try {
    const { data } = await API.post('/learning/backfill');
    showToast(`AI analyzed ${data.routes_processed} routes!`, 'success');
  } catch (e) {
    showToast('Analysis failed', 'error');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-sync-alt"></i> Re-analyze'; }
  }
}

function showAiRecommendationsModal(data, date) {
  const recs = data.recommendations || [];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const recCards = recs.map((rec, idx) => {
    const confColor = rec.confidence >= 0.5 ? '#059669' : rec.confidence >= 0.2 ? '#D97706' : '#6B7280';
    const confLabel = rec.confidence >= 0.5 ? 'High' : rec.confidence >= 0.2 ? 'Medium' : 'Learning';
    const confPct = Math.round(rec.confidence * 100);
    const truckInfo = rec.recommended_truck ? `<span style="font-size:11px"><i class="fas fa-truck"></i> ${rec.recommended_truck.name}</span>` : '';
    const driverInfo = rec.recommended_driver ? `<span style="font-size:11px"><i class="fas fa-user"></i> ${rec.recommended_driver.name}</span>` : '';
    const reasons = (rec.reasons || []).map(r => `<div style="font-size:10px;color:var(--gray-500);padding-left:12px">• ${r}</div>`).join('');

    return `<div style="border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:10px;background:white">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-size:11px;font-weight:800;padding:3px 10px;border-radius:12px">Route ${rec.group_index}</span>
          <span style="font-size:12px;font-weight:700;color:var(--navy)">${rec.totals.stops} stops · ${rec.totals.pallets}p · ${rec.totals.items} units</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <div style="width:40px;height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden"><div style="width:${confPct}%;height:100%;background:${confColor};border-radius:3px"></div></div>
          <span style="font-size:10px;font-weight:700;color:${confColor}">${confPct}% ${confLabel}</span>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        ${rec.orders.map(o => `<span style="font-size:11px;padding:2px 8px;background:#EEF2FF;color:#3730A3;border-radius:6px;font-weight:600">${o.business_name}${o.day_affinity > 0 ? ' <i class="fas fa-calendar-check" style="font-size:9px;color:#059669" title="Usually delivers on this day"></i>' : ''}</span>`).join('')}
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">${truckInfo}${driverInfo}</div>
      ${reasons ? `<div style="margin-top:6px;border-top:1px solid #F3F4F6;padding-top:6px">${reasons}</div>` : ''}
      <button class="btn btn-sm" onclick="applyAiRecommendation(${idx}, '${date}')" style="margin-top:8px;width:100%;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700;font-size:11px;padding:6px">
        <i class="fas fa-plus-circle"></i> Apply This Route
      </button>
    </div>`;
  }).join('');

  modal.innerHTML = `<div class="modal" style="max-width:600px;max-height:85vh">
    <div class="modal-header" style="background:linear-gradient(135deg,#7C3AED,#5B21B6)">
      <h3 class="modal-title" style="color:white"><i class="fas fa-brain"></i> AI Route Recommendations</h3>
      <button class="modal-close" style="color:white" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div style="padding:12px 16px;background:#F5F3FF;border-bottom:1px solid #E5E7EB">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#5B21B6;font-weight:600"><i class="fas fa-calendar"></i> ${dayjs(date).format('ddd, MMM D')} · ${data.total_orders} orders analyzed</span>
        <button class="btn btn-sm" onclick="showLearningInsights()" style="font-size:10px;padding:3px 10px;background:#EDE9FE;color:#7C3AED;border:none;font-weight:600">
          <i class="fas fa-chart-line"></i> View Learning Data
        </button>
      </div>
    </div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto;padding:16px">
      ${recs.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--gray-400)"><i class="fas fa-robot" style="font-size:32px;margin-bottom:10px;display:block"></i>Not enough data to make recommendations yet. Create more routes to help the AI learn.</div>' : recCards}
    </div>
  </div>`;
  document.body.appendChild(modal);
  window._aiRecommendations = data.recommendations;
}

function applyAiRecommendation(recIdx, date) {
  const rec = window._aiRecommendations?.[recIdx];
  if (!rec) return;

  // Clear current stops and add recommended ones
  window._rb.stops = [];
  for (const o of rec.orders) {
    const fullOrder = window._rb.orders?.find(ord => ord.id === o.id);
    if (fullOrder) {
      const addr = `${fullOrder.street || ''}, ${fullOrder.city || ''} FL`;
      window._rb.stops.push({
        type: 'order', id: fullOrder.id, name: fullOrder.business_name,
        order_number: fullOrder.order_number, address: addr, originalAddress: addr,
        lat: fullOrder.lat, lng: fullOrder.lng,
        item_count: fullOrder.item_count || o.item_count, pallet_count: fullOrder.pallet_count || o.pallet_count,
        priority: fullOrder.priority, gate_code: fullOrder.gate_code, leg: null
      });
    }
  }

  // Set recommended truck and driver if available
  if (rec.recommended_truck) {
    const truckSel = document.getElementById('rbTruck');
    if (truckSel) truckSel.value = rec.recommended_truck.id;
  }
  if (rec.recommended_driver) {
    const driverSel = document.getElementById('rbDriver');
    if (driverSel) driverSel.value = rec.recommended_driver.id;
  }
  // Set date
  const dateEl = document.getElementById('rbDate');
  if (dateEl) dateEl.value = date;

  document.querySelector('.modal-overlay')?.remove();
  window._rb.directions = null;
  rbRefreshUI();
  rbSwitchTab('stops');
  showToast(`Applied AI recommendation: Route ${rec.group_index} — ${rec.orders.length} stops`, 'success');
}

// ==================== LEARNING INSIGHTS ====================
async function showLearningInsights() {
  try {
    const { data } = await API.get('/learning/stats');
    const t = data.totals || {};

    const pairingRows = (data.top_customer_pairings || []).slice(0, 10).map(p =>
      `<tr><td style="font-size:11px">${p.customer_a_name}</td><td style="font-size:11px">${p.customer_b_name}</td><td style="font-size:11px;font-weight:700;text-align:center">${p.times_paired}x</td></tr>`
    ).join('');

    const truckRows = (data.top_truck_affinities || []).slice(0, 10).map(a =>
      `<tr><td style="font-size:11px">${a.business_name}</td><td style="font-size:11px">${a.truck_name}</td><td style="font-size:11px;font-weight:700;text-align:center">${a.times_assigned}x</td></tr>`
    ).join('');

    const driverRows = (data.top_driver_affinities || []).slice(0, 10).map(a =>
      `<tr><td style="font-size:11px">${a.business_name}</td><td style="font-size:11px">${a.driver_name}</td><td style="font-size:11px;font-weight:700;text-align:center">${a.times_assigned}x</td></tr>`
    ).join('');

    const dayBars = (data.day_distribution || []).map(d => {
      const maxCount = Math.max(...(data.day_distribution || []).map(x => x.total || 0), 1);
      const pct = Math.round((d.total / maxCount) * 100);
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:11px;width:30px;font-weight:600;text-transform:uppercase">${d.day_of_week}</span>
        <div style="flex:1;height:16px;background:#F3F4F6;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7C3AED,#A78BFA);border-radius:4px"></div></div>
        <span style="font-size:11px;font-weight:700;color:var(--navy);width:30px;text-align:right">${d.total}</span>
      </div>`;
    }).join('');

    // Remove any existing overlay first
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal" style="max-width:700px;max-height:85vh">
      <div class="modal-header" style="background:linear-gradient(135deg,#7C3AED,#5B21B6)">
        <h3 class="modal-title" style="color:white"><i class="fas fa-chart-line"></i> Learning Insights — What the AI Knows</h3>
        <button class="modal-close" style="color:white" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="max-height:65vh;overflow-y:auto;padding:16px">
        <!-- Stats Cards -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
          <div style="background:#F5F3FF;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:800;color:#5B21B6">${t.route_snapshots || 0}</div>
            <div style="font-size:10px;color:#7C3AED;font-weight:600">Routes Learned</div>
          </div>
          <div style="background:#FEF3C7;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:800;color:#92400E">${t.customer_pairings || 0}</div>
            <div style="font-size:10px;color:#D97706;font-weight:600">Customer Pairings</div>
          </div>
          <div style="background:#ECFDF5;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:800;color:#065F46">${t.pallet_corrections || 0}</div>
            <div style="font-size:10px;color:#059669;font-weight:600">Pallet Corrections</div>
          </div>
        </div>

        <!-- Day Distribution -->
        <div style="margin-bottom:16px">
          <h4 style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-calendar-week" style="color:#7C3AED"></i> Delivery Day Patterns</h4>
          ${dayBars || '<div style="color:var(--gray-400);font-size:12px">No data yet</div>'}
        </div>

        <!-- Top Customer Pairings -->
        <div style="margin-bottom:16px">
          <h4 style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-users" style="color:#7C3AED"></i> Customers Often Grouped Together</h4>
          ${pairingRows ? `<table class="data-table" style="font-size:11px"><thead><tr><th>Customer A</th><th>Customer B</th><th style="text-align:center">Times</th></tr></thead><tbody>${pairingRows}</tbody></table>` : '<div style="color:var(--gray-400);font-size:12px">No pairings learned yet</div>'}
        </div>

        <!-- Top Truck Affinities -->
        <div style="margin-bottom:16px">
          <h4 style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-truck" style="color:#7C3AED"></i> Customer → Truck Patterns</h4>
          ${truckRows ? `<table class="data-table" style="font-size:11px"><thead><tr><th>Customer</th><th>Truck</th><th style="text-align:center">Times</th></tr></thead><tbody>${truckRows}</tbody></table>` : '<div style="color:var(--gray-400);font-size:12px">No truck patterns yet</div>'}
        </div>

        <!-- Top Driver Affinities -->
        <div style="margin-bottom:16px">
          <h4 style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-user-tie" style="color:#7C3AED"></i> Customer → Driver Patterns</h4>
          ${driverRows ? `<table class="data-table" style="font-size:11px"><thead><tr><th>Customer</th><th>Driver</th><th style="text-align:center">Times</th></tr></thead><tbody>${driverRows}</tbody></table>` : '<div style="color:var(--gray-400);font-size:12px">No driver patterns yet</div>'}
        </div>

        <!-- View full dashboard link -->
        <div style="text-align:center;padding:12px;border-top:1px solid #E5E7EB">
          <button class="btn btn-sm btn-outline" onclick="this.closest('.modal-overlay').remove();navigate('learning')" style="font-size:11px">
            <i class="fas fa-external-link-alt"></i> Open Full Dashboard
          </button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch (e) {
    console.error('Learning insights error:', e);
    showToast('Failed to load learning data', 'error');
  }
}

async function rbCalculateRoute() {
  const stops = window._rb.stops.filter(s => s.lat && s.lng);
  if (stops.length === 0) { showToast('No geocoded stops to calculate', 'warning'); return; }
  if (window._rb.calculating) return;
  window._rb.calculating = true;

  const btn = document.getElementById('rbCalcBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...'; }

  try {
    const request = _rbBuildRequest(false);
    const svc = window._rb.directionsService;
    const result = await new Promise((resolve, reject) => {
      svc.route(request, (res, status) => {
        if (status === 'OK') resolve(res);
        else reject(new Error('Directions failed: ' + status));
      });
    });

    _rbApplyDirectionsResult(result, false);
  } catch (err) {
    console.error('Route calculation failed:', err);
    showToast('Route calculation failed: ' + err.message, 'error');
  }

  window._rb.calculating = false;
  rbRefreshUI();
  if (btn) { btn.disabled = window._rb.stops.filter(s => s.lat && s.lng).length < 1; btn.innerHTML = '<i class="fas fa-directions"></i> Calculate'; }
}

// ---- Optimize route order via native Google Directions ----
async function rbOptimizeRoute() {
  const geoStops = window._rb.stops.filter(s => s.lat && s.lng);
  if (geoStops.length < 2) { showToast('Need at least 2 geocoded stops to optimize', 'warning'); return; }
  if (window._rb.calculating) return;
  window._rb.calculating = true;

  const btn = document.getElementById('rbOptBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Optimizing...'; }

  try {
    const request = _rbBuildRequest(true);
    const svc = window._rb.directionsService;
    const result = await new Promise((resolve, reject) => {
      svc.route(request, (res, status) => {
        if (status === 'OK') resolve(res);
        else reject(new Error('Optimization failed: ' + status));
      });
    });

    _rbApplyDirectionsResult(result, true);
    const d = window._rb.directions;
    showToast(`Route optimized: ${d.total_distance?.text} \u2022 ${d.total_duration?.text}`, 'success');
  } catch (err) {
    console.error('Route optimization failed:', err);
    showToast('Optimization failed: ' + err.message, 'error');
  }

  window._rb.calculating = false;
  rbRefreshUI();
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Optimize'; }
}

// ---- Turn-by-Turn Directions Panel ----
function rbRenderTurnByTurn(legs) {
  const panel = document.getElementById('rbDirectionsPanel');
  if (!panel) return;

  const colors = ['#4285F4','#EA4335','#FBBC05','#34A853','#FF6D01','#46BDC6','#7B1FA2','#C2185B','#00897B','#6D4C41'];
  const stopNames = window._rb.stops.filter(s => s.lat && s.lng);
  let html = '';

  legs.forEach((leg, i) => {
    const color = colors[i % colors.length];
    const isLast = i === legs.length - 1;
    const legLabel = i === 0 ? 'DEPOT' : `Stop ${i}: ${escapeHtml(stopNames[i-1]?.name || '')}`;
    const destLabel = isLast ? 'DEPOT (Return)' : `Stop ${i+1}: ${escapeHtml(stopNames[i]?.name || '')}`;

    html += `<div style="border-bottom:2px solid ${color}">
      <div style="padding:8px 14px;background:${color}11;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.rb-tbt-chev').classList.toggle('fa-chevron-down');this.querySelector('.rb-tbt-chev').classList.toggle('fa-chevron-right')">
        <span style="width:22px;height:22px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${i === 0 ? '<i class="fas fa-warehouse" style="font-size:8px"></i>' : i}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:var(--navy)">${escapeHtml(legLabel)} <i class="fas fa-arrow-right" style="font-size:8px;color:${color};margin:0 4px"></i> ${escapeHtml(destLabel)}</div>
          <div style="font-size:10px;color:#666;margin-top:1px">${leg.distance?.text || ''} \u2022 ${leg.duration?.text || ''}</div>
        </div>
        <i class="fas fa-chevron-down rb-tbt-chev" style="color:#999;font-size:10px"></i>
      </div>
      <div style="display:none">`;

    // Steps within this leg
    const steps = leg.steps || [];
    steps.forEach((step, si) => {
      const maneuver = step.maneuver || '';
      const icon = _rbManeuverIcon(maneuver);
      html += `<div style="display:flex;gap:10px;padding:6px 14px 6px 24px;border-bottom:1px solid #F3F4F6;align-items:flex-start;font-size:11px">
        <i class="${icon}" style="color:${color};font-size:12px;margin-top:2px;width:16px;text-align:center;flex-shrink:0"></i>
        <div style="flex:1;min-width:0;color:#374151;line-height:1.4">${step.instructions || ''}</div>
        <div style="flex-shrink:0;text-align:right;white-space:nowrap;color:#6B7280;font-size:10px">
          <div>${step.distance?.text || ''}</div>
          <div style="color:#059669">${step.duration?.text || ''}</div>
        </div>
      </div>`;
    });

    html += `</div></div>`;
  });

  panel.innerHTML = html;
}

function _rbManeuverIcon(maneuver) {
  if (!maneuver) return 'fas fa-arrow-up';
  if (maneuver.includes('left')) return 'fas fa-arrow-turn-down fa-rotate-90';
  if (maneuver.includes('right')) return 'fas fa-arrow-turn-up fa-rotate-90';
  if (maneuver.includes('uturn')) return 'fas fa-arrow-rotate-left';
  if (maneuver.includes('merge')) return 'fas fa-code-merge';
  if (maneuver.includes('ramp')) return 'fas fa-road';
  if (maneuver.includes('fork')) return 'fas fa-code-branch';
  if (maneuver.includes('roundabout')) return 'fas fa-circle-notch';
  return 'fas fa-arrow-up';
}

function rbRenderDirectionsSummary(data, legs) {
  const el = document.getElementById('rbDirSummary');
  if (!el) return;

  const colors = ['#4285F4','#EA4335','#FBBC05','#34A853','#FF6D01','#46BDC6','#7B1FA2','#C2185B','#00897B','#6D4C41'];

  let legHtml = `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:2px"><span style="background:#1E3A8A;color:white;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:7px"><i class="fas fa-warehouse"></i></span></span>`;

  legs.forEach((leg, i) => {
    const isLast = i === legs.length - 1;
    const color = colors[i % colors.length];
    legHtml += `<span style="display:inline-flex;align-items:center;gap:2px;margin-right:2px;font-size:9px">
      <span style="width:20px;height:3px;background:${color};border-radius:2px;display:inline-block"></span>
      <span style="color:${color};font-weight:700">${leg.duration?.text || ''}</span>
    </span>`;
    if (isLast) {
      legHtml += `<span style="display:inline-flex;align-items:center"><span style="background:#1E3A8A;color:white;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:7px"><i class="fas fa-warehouse"></i></span></span>`;
    } else {
      legHtml += `<span style="display:inline-flex;align-items:center;margin-right:2px"><span style="background:#F97316;color:white;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700">${i + 1}</span></span>`;
    }
  });

  const totalStopTime = (window._rb.stops.length * (window._rb.stopMinutes || 10));
  const driveMin = data.total_duration?.minutes || 0;
  const grandTotal = driveMin + totalStopTime;
  const totalMiles = data.total_distance?.miles || 0;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%">
      <div style="display:flex;align-items:center;gap:4px">
        <i class="fas fa-road" style="color:#4285F4;font-size:13px"></i>
        <strong style="font-size:13px;color:var(--navy)">${data.total_distance?.text || '?'}</strong>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <i class="fas fa-car" style="color:#059669;font-size:12px"></i>
        <strong style="font-size:13px;color:var(--navy)">${data.total_duration?.text || '?'}</strong>
        <span style="font-size:9px;color:#666">drive</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <i class="fas fa-dolly" style="color:#D97706;font-size:11px"></i>
        <span style="font-size:12px;color:#D97706;font-weight:600">${totalStopTime}m</span>
        <span style="font-size:9px;color:#666">stops</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <i class="fas fa-calendar-day" style="color:#7C3AED;font-size:11px"></i>
        <span style="font-size:12px;color:#7C3AED;font-weight:700">${Math.floor(grandTotal/60)}h ${grandTotal%60}m</span>
        <span style="font-size:9px;color:#666">total</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <i class="fas fa-gas-pump" style="color:#DC2626;font-size:10px"></i>
        <span style="font-size:11px">~${(totalMiles / 8).toFixed(1)}gal ($${((totalMiles / 8) * 4.2).toFixed(0)})</span>
      </div>
    </div>
    <div style="margin-top:4px;display:flex;flex-wrap:wrap;align-items:center;gap:1px">${legHtml}</div>
    ${data.warnings?.length ? `<div style="margin-top:3px;font-size:9px;color:#D97706"><i class="fas fa-exclamation-triangle"></i> ${data.warnings.join('; ')}</div>` : ''}`;
}

async function rbSubmitRoute() {
  const stops = window._rb.stops;
  if (stops.length === 0) { showToast('Add at least one stop', 'warning'); return; }

  const date = document.getElementById('rbDate')?.value;
  if (!date) { showToast('Please select a date', 'warning'); return; }

  const orderIds = stops.filter(s => s.type === 'order').map(s => s.id);
  const returnIds = stops.filter(s => s.type === 'return').map(s => s.id);

  const btn = document.getElementById('rbCreateBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...'; }

  // Build notes with ETA schedule
  let notes = 'Created via Route Builder';
  if (window._rb.directions) {
    const dir = window._rb.directions;
    notes = `Route Builder: ${dir.total_distance?.text || ''} / ${dir.total_duration?.text || ''}`;
    if (window._rb._returnEta) notes += ` | Depart ${window._rb.departureTime || '06:00'} → Return ${window._rb._returnEta}`;
  }

  try {
    const { data } = await API.post('/routes', {
      date,
      driver_id: parseInt(document.getElementById('rbDriver')?.value) || null,
      truck_id: parseInt(document.getElementById('rbTruck')?.value) || null,
      order_ids: orderIds,
      return_ids: returnIds,
      notes,
    });
    showToast(`Route ${data.route_number} created!`, 'success');
    navigate('routes', { viewId: data.id });
  } catch (err) {
    showToast('Failed to create route: ' + (err.response?.data?.error || err.message), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Create'; }
  }
}

// ==================== DELIVERY ZONES PAGE ====================
async function renderZones() {
  const pc = document.getElementById('pageContent');
  if (window._params?.viewId) { return renderZoneDetail(window._params.viewId); }
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';

  let zones = [], schedule = {};
  try {
    const [zonesRes, schedRes] = await Promise.all([
      API.get('/zones'),
      API.get('/zones/schedule')
    ]);
    zones = zonesRes.data.zones || [];
    schedule = schedRes.data.schedule || {};
  } catch (err) {
    console.error('Failed to load zones:', err);
    pc.innerHTML = `<div class="card" style="padding:40px;text-align:center">
      <i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i>
      <h3 style="color:var(--navy)">Failed to Load Delivery Zones</h3>
      <p style="color:var(--gray-500);margin:8px 0 16px">The zones data could not be fetched. Please check your connection and try again.</p>
      <button class="btn btn-primary" onclick="renderZones()"><i class="fas fa-redo"></i> Retry</button>
    </div>`;
    return;
  }
  const allDays = ['mon','tue','wed','thu','fri','sat'];
  const dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat' };

  pc.innerHTML = `
    <div class="filters-bar no-print">
      <button class="btn btn-primary" onclick="showNewZoneModal()"><i class="fas fa-plus"></i> ${t('zones_new')}</button>
      <button class="btn btn-outline" onclick="autoAssignZones()"><i class="fas fa-magic"></i> ${t('zones_auto_assign')}</button>
    </div>

    <!-- Zone Schedule Matrix -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-calendar-week" style="color:var(--navy-light);margin-right:8px"></i>${t('zones_schedule')}</h3>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-container">
          <table>
            <thead><tr><th style="width:180px">${t('zones_name')}</th>${allDays.map(d => `<th style="text-align:center;width:100px">${dayLabels[d]}</th>`).join('')}<th style="text-align:center">${t('zones_addresses')}</th></tr></thead>
            <tbody>
              ${zones.map(z => {
                const zDays = z.delivery_days ? z.delivery_days.split(',').map(s => s.trim().toLowerCase()) : [];
                return `<tr style="cursor:pointer" onclick="navigate('zones',{viewId:${z.id}})">
                  <td><div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:50%;background:${z.color};flex-shrink:0"></span><strong style="color:var(--navy)">${z.name}</strong></div></td>
                  ${allDays.map(d => `<td style="text-align:center">${zDays.includes(d) ? `<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${z.color}20;color:${z.color};line-height:28px;font-size:14px;font-weight:700"><i class="fas fa-check"></i></span>` : '<span style="color:var(--gray-300)">—</span>'}</td>`).join('')}
                  <td style="text-align:center"><span style="font-weight:600">${z.address_count || 0}</span></td>
                </tr>`;
              }).join('')}
              ${zones.length === 0 ? `<tr><td colspan="${allDays.length + 2}"><div class="empty-state" style="padding:24px"><i class="fas fa-map-location-dot"></i><h3>${t('zones_no_zones')}</h3><p>${t('zones_create_first')}</p></div></td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Map View -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-map" style="color:var(--navy-light);margin-right:8px"></i>${t('zones_title')} Map</h3>
      </div>
      <div id="zonesMap" style="height:450px;border-radius:0 0 12px 12px"></div>
    </div>`;

  // Init zones map
  setTimeout(() => initZonesMap(zones), 100);
}

function initZonesMap(zones) {
  if (!window.__gmapsLoaded) return;
  const depot = window.__DEPOT || DEPOT;
  const container = document.getElementById('zonesMap');
  if (!container) return;
  const map = new google.maps.Map(container, { center: { lat: depot.lat, lng: depot.lng }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
  window._zonesMap = map;

  // Depot marker
  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#1E3A8A', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });

  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });

  zones.forEach(z => {
    // Draw zone boundary polygon if exists
    if (z.boundary_json) {
      try {
        const poly = JSON.parse(z.boundary_json);
        const paths = poly.map(p => Array.isArray(p[0]) ? p.map(c => ({ lat: c[0], lng: c[1] })) : ({ lat: p[0], lng: p[1] }));
        new google.maps.Polygon({ paths, strokeColor: z.color, strokeOpacity: 0.6, strokeWeight: 2, fillColor: z.color, fillOpacity: 0.15, map });
        poly.forEach(p => { if (Array.isArray(p[0])) p.forEach(c => bounds.extend({ lat: c[0], lng: c[1] })); else bounds.extend({ lat: p[0], lng: p[1] }); });
      } catch (e) {}
    }
    // Draw zone radius circle
    if (z.center_lat && z.center_lng) {
      bounds.extend({ lat: z.center_lat, lng: z.center_lng });
      const circle = new google.maps.Circle({ center: { lat: z.center_lat, lng: z.center_lng }, radius: (z.radius_miles || 5) * 1609.34, strokeColor: z.color, strokeOpacity: 0.5, strokeWeight: 2, fillColor: z.color, fillOpacity: 0.08, map });
      const iw = new google.maps.InfoWindow({ content: `<strong style="color:${z.color}">${z.name}</strong><br>${z.delivery_days}<br>Radius: ${z.radius_miles} mi` });
      circle.addListener('click', (e) => { iw.setPosition(e.latLng); iw.open(map); });
    }
  });

  map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
}

async function renderZoneDetail(id) {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  let zone, addresses = [];
  try {
    const { data } = await API.get(`/zones/${id}`);
    zone = data.zone;
    addresses = data.addresses || [];
    if (!zone) throw new Error('Zone not found');
  } catch (err) {
    console.error('Failed to load zone detail:', err);
    pc.innerHTML = `<div style="margin-bottom:16px"><button class="btn btn-outline" onclick="navigate('zones')"><i class="fas fa-arrow-left"></i> ${t('zones_title')}</button></div>
      <div class="card" style="padding:40px;text-align:center">
        <i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i>
        <h3 style="color:var(--navy)">Failed to Load Zone</h3>
        <p style="color:var(--gray-500);margin:8px 0 16px">Could not fetch zone details. It may have been deleted.</p>
        <button class="btn btn-primary" onclick="navigate('zones')"><i class="fas fa-arrow-left"></i> Back to Zones</button>
      </div>`;
    return;
  }
  const zDays = zone.delivery_days ? zone.delivery_days.split(',').map(s => s.trim()) : [];
  const allDays = ['mon','tue','wed','thu','fri','sat'];
  const dayLabels = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' };

  pc.innerHTML = `
    <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-outline" onclick="navigate('zones')"><i class="fas fa-arrow-left"></i> ${t('zones_title')}</button>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="showEditZoneModal(${id})"><i class="fas fa-edit"></i> ${t('zones_edit')}</button>
        <button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="deleteZone(${id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>

    <!-- Zone Info -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:18px;height:18px;border-radius:50%;background:${zone.color}"></span>
          <h3 class="card-title" style="font-size:20px">${zone.name}</h3>
        </div>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">
          <div><div class="form-label">${t('zones_delivery_days')}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${allDays.map(d => `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;${zDays.includes(d)?`background:${zone.color}20;color:${zone.color}`:'background:var(--gray-100);color:var(--gray-400)'}">${dayLabels[d]}</span>`).join('')}
            </div>
          </div>
          <div><div class="form-label">${t('zones_radius')}</div><strong>${zone.radius_miles || 5} mi</strong></div>
          <div><div class="form-label"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:4px"></i> Default Truck</div>${zone.default_truck_name ? `<strong style="color:var(--navy)">${zone.default_truck_name}</strong>` : '<span style="color:var(--gray-400)">None assigned</span>'}</div>
          <div><div class="form-label">${t('zones_city_pattern')}</div><strong>${zone.city_pattern || '—'}</strong></div>
          <div><div class="form-label">${t('zones_zip_codes')}</div><strong>${zone.zip_codes || '—'}</strong></div>
          <div><div class="form-label">${t('zones_addresses')}</div><strong>${addresses.length}</strong></div>
          ${zone.notes ? `<div style="grid-column:span 2"><div class="form-label">${t('zones_notes')}</div><p style="font-size:13px">${zone.notes}</p></div>` : ''}
        </div>
      </div>
    </div>

    <!-- Zone Map -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3 class="card-title"><i class="fas fa-map" style="color:var(--navy-light);margin-right:8px"></i>${t('zones_boundary')}</h3></div>
      <div id="zoneDetailMap" style="height:350px;border-radius:0 0 12px 12px"></div>
    </div>

    <!-- Addresses in Zone -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title"><i class="fas fa-map-pin" style="color:${zone.color};margin-right:8px"></i>${t('zones_addresses')} (${addresses.length})</h3>
      </div>
      <div class="table-container">
        <table><thead><tr><th>${t('dash_customer')}</th><th>${t('orders_address')}</th><th>${t('addr_gate_code')}</th></tr></thead>
        <tbody>
          ${addresses.map(a => `<tr>
            <td><strong>${a.business_name}</strong></td>
            <td>${a.street || ''}, ${a.city || ''} ${a.zip || ''}</td>
            <td>${a.gate_code || '—'}</td>
          </tr>`).join('')}
          ${addresses.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--gray-400)">No addresses assigned to this zone</td></tr>' : ''}
        </tbody></table>
      </div>
    </div>`;

  // Init zone detail map
  setTimeout(() => {
    if (!window.__gmapsLoaded) return;
    const depot = window.__DEPOT || DEPOT;
    const map = new google.maps.Map(document.getElementById('zoneDetailMap'), { center: { lat: zone.center_lat || depot.lat, lng: zone.center_lng || depot.lng }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    window._zoneDetailMap = map;

    // Draw zone circle
    if (zone.center_lat && zone.center_lng) {
      new google.maps.Circle({ center: { lat: zone.center_lat, lng: zone.center_lng }, radius: (zone.radius_miles || 5) * 1609.34, strokeColor: zone.color, strokeOpacity: 0.5, strokeWeight: 2, fillColor: zone.color, fillOpacity: 0.1, map });
    }

    // Draw polygon boundary
    if (zone.boundary_json) {
      try {
        const poly = JSON.parse(zone.boundary_json);
        const paths = poly.map(p => Array.isArray(p[0]) ? p.map(c => ({ lat: c[0], lng: c[1] })) : ({ lat: p[0], lng: p[1] }));
        new google.maps.Polygon({ paths, strokeColor: zone.color, strokeOpacity: 0.6, strokeWeight: 2, fillColor: zone.color, fillOpacity: 0.15, map });
      } catch (e) {}
    }

    // Depot
    new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#1E3A8A', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, zIndex: 1000 });

    // Address markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: depot.lat, lng: depot.lng });
    if (zone.center_lat && zone.center_lng) bounds.extend({ lat: zone.center_lat, lng: zone.center_lng });
    addresses.forEach(a => {
      if (!a.lat || !a.lng) return;
      bounds.extend({ lat: a.lat, lng: a.lng });
      const marker = new google.maps.Marker({ position: { lat: a.lat, lng: a.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: zone.color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, zIndex: 100 });
      const iw = new google.maps.InfoWindow({ content: `<strong>${a.business_name}</strong><br>${a.street}, ${a.city}${a.gate_code ? '<br><i class="fas fa-key"></i> '+a.gate_code : ''}` });
      marker.addListener('click', () => iw.open(map, marker));
    });
    map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
  }, 100);
}

async function showNewZoneModal() {
  const trucksRes = await API.get('/trucks');
  const trucks = (trucksRes.data.trucks || []).filter(t => !t.archived);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg" style="max-width:800px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-map-location-dot" style="color:var(--navy-light)"></i> ${t('zones_new')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">${t('zones_name')} *</label><input class="form-input" id="zoneName" placeholder="e.g. Loxahatchee North"></div>
        <div class="form-group"><label class="form-label">${t('zones_color')}</label><input type="color" id="zoneColor" value="#2563EB" style="width:50px;height:36px;border:none;cursor:pointer"></div>
        <div class="form-group"><label class="form-label">${t('zones_radius')}</label><input class="form-input" id="zoneRadius" type="number" value="5" min="1" max="30"></div>
      </div>
      <div class="form-group"><label class="form-label"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:4px"></i> Default Truck</label>
        <select class="form-select" id="zoneDefaultTruck">
          <option value="">No default truck</option>
          ${trucks.map(tk => `<option value="${tk.id}">${tk.name} (${tk.max_pallet_spots||12} pallets)</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">${t('zones_delivery_days')} *</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap" id="zoneDayPicker">
          ${['mon','tue','wed','thu','fri','sat'].map(d => `<button type="button" class="btn btn-sm btn-outline zone-day-btn" data-day="${d}" onclick="this.classList.toggle('btn-primary');this.classList.toggle('btn-outline')">${{mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat'}[d]}</button>`).join('')}
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">${t('zones_city_pattern')}</label><input class="form-input" id="zoneCityPattern" placeholder="e.g. Loxahatchee%"></div>
        <div class="form-group"><label class="form-label">${t('zones_zip_codes')}</label>
          <div id="newZoneZipContainer" class="zip-tag-container">
            <input class="zip-tag-input" id="newZoneZipInput" placeholder="Add ZIP..." onkeydown="handleZipKeydown(event,'newZoneZipContainer','newZoneZipInput','updateNewZoneZipInput')">
          </div>
          <input type="hidden" id="zoneZipCodes" value="">
        </div>
        <div class="form-group"><label class="form-label">${t('zones_center')}</label><input class="form-input" id="zoneCenter" placeholder="lat, lng"></div>
      </div>
      <!-- Map for setting center -->
      <div class="form-group">
        <label class="form-label">${t('zones_click_to_set')}</label>
        <div id="zonePickerMap" style="height:250px;border-radius:8px;border:1px solid var(--gray-200)"></div>
      </div>
      <div class="form-group"><label class="form-label">${t('zones_notes')}</label><textarea class="form-textarea" id="zoneNotes" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitNewZone()"><i class="fas fa-map-location-dot"></i> ${t('zones_new')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  // Init picker map
  setTimeout(() => {
    const mapEl = document.getElementById('zonePickerMap');
    if (!mapEl) return;
    if (!window.__gmapsLoaded) return;
    const _depot = window.__DEPOT || DEPOT;
    mapEl.innerHTML = '';
    const map = new google.maps.Map(mapEl, { center: { lat: _depot.lat, lng: _depot.lng }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    window._zonePickerMap = map;
    const observer = new ResizeObserver(() => { google.maps.event.trigger(map, 'resize'); });
    observer.observe(mapEl);
    new google.maps.Marker({ position: { lat: _depot.lat, lng: _depot.lng }, map, title: 'BF Distribution Center' });

    let centerMarker = null;
    let radiusCircle = null;
    map.addListener('click', (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      document.getElementById('zoneCenter').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      if (centerMarker) centerMarker.setMap(null);
      if (radiusCircle) radiusCircle.setMap(null);
      const color = document.getElementById('zoneColor').value;
      const radius = parseFloat(document.getElementById('zoneRadius').value) || 5;
      centerMarker = new google.maps.Marker({ position: { lat, lng }, map });
      radiusCircle = new google.maps.Circle({ center: { lat, lng }, radius: radius * 1609.34, strokeColor: color, fillColor: color, fillOpacity: 0.15, strokeWeight: 2, map });
    });
  }, 200);
}

async function submitNewZone() {
  const name = document.getElementById('zoneName').value.trim();
  if (!name) { showToast('Please enter a zone name', 'warning'); return; }
  const selectedDays = Array.from(document.querySelectorAll('.zone-day-btn.btn-primary')).map(b => b.getAttribute('data-day'));
  if (selectedDays.length === 0) { showToast('Please select delivery days', 'warning'); return; }
  const centerVal = document.getElementById('zoneCenter').value.trim();
  let center_lat = null, center_lng = null;
  if (centerVal) {
    const parts = centerVal.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) { center_lat = parts[0]; center_lng = parts[1]; }
  }
  updateNewZoneZipInput();
  try {
    const truckVal = document.getElementById('zoneDefaultTruck')?.value;
    await API.post('/zones', {
      name,
      color: document.getElementById('zoneColor').value,
      delivery_days: selectedDays.join(','),
      radius_miles: parseFloat(document.getElementById('zoneRadius').value) || 5,
      center_lat, center_lng,
      city_pattern: document.getElementById('zoneCityPattern').value.trim() || null,
      zip_codes: document.getElementById('zoneZipCodes').value.trim() || null,
      notes: document.getElementById('zoneNotes').value.trim() || null,
      default_truck_id: truckVal ? parseInt(truckVal) : null,
    });
    if (window._zonePickerMap) { window._zonePickerMap = null; }
    document.querySelector('.modal-overlay')?.remove();
    showToast('Zone created!');
    renderZones();
  } catch (err) { showToast('Failed to create zone', 'error'); }
}

async function showEditZoneModal(id) {
  const [zoneRes, trucksRes] = await Promise.all([API.get(`/zones/${id}`), API.get('/trucks')]);
  const zone = zoneRes.data.zone;
  const trucks = (trucksRes.data.trucks || []).filter(t => !t.archived);
  const zDays = zone.delivery_days ? zone.delivery_days.split(',').map(s => s.trim().toLowerCase()) : [];
  const existingZips = zone.zip_codes ? zone.zip_codes.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Remove any previous edit zone modals and their maps
  document.querySelectorAll('.modal-overlay.edit-zone-modal').forEach(el => {
    el.remove();
  });
  if (window._editZoneMap) { try { window._editZoneMap.remove(); } catch(e) {} window._editZoneMap = null; }
  if (window._editZoneObserver) { try { window._editZoneObserver.disconnect(); } catch(e) {} window._editZoneObserver = null; }
  // Also remove background maps that might conflict
  if (window._zoneDetailMap) { try { window._zoneDetailMap.remove(); } catch(e) {} window._zoneDetailMap = null; }
  if (window._zonesMap) { try { window._zonesMap.remove(); } catch(e) {} window._zonesMap = null; }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay edit-zone-modal';
  modal.onclick = (e) => { if (e.target === modal) { cleanupEditZoneMap(); modal.remove(); } };
  modal.innerHTML = `<div class="modal modal-lg" style="max-width:800px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-edit" style="color:var(--navy-light)"></i> ${t('zones_edit')}</h3><button class="modal-close" onclick="cleanupEditZoneMap();this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">${t('zones_name')} *</label><input class="form-input" id="editZoneName" value="${zone.name}"></div>
        <div class="form-group"><label class="form-label">${t('zones_color')}</label><input type="color" id="editZoneColor" value="${zone.color || '#2563EB'}" style="width:50px;height:36px;border:none;cursor:pointer"></div>
        <div class="form-group"><label class="form-label">${t('zones_radius')}</label><input class="form-input" id="editZoneRadius" type="number" value="${zone.radius_miles || 5}" min="1" max="30"></div>
      </div>
      <div class="form-group"><label class="form-label">${t('zones_delivery_days')} *</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${['mon','tue','wed','thu','fri','sat'].map(d => `<button type="button" class="btn btn-sm ${zDays.includes(d)?'btn-primary':'btn-outline'} edit-zone-day-btn" data-day="${d}" onclick="this.classList.toggle('btn-primary');this.classList.toggle('btn-outline')">${{mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat'}[d]}</button>`).join('')}
        </div>
      </div>
      <div class="form-group"><label class="form-label"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:4px"></i> Default Truck</label>
        <select class="form-select" id="editZoneDefaultTruck">
          <option value="">No default truck</option>
          ${trucks.map(tk => `<option value="${tk.id}" ${zone.default_truck_id==tk.id?'selected':''}>${tk.name} (${tk.max_pallet_spots||12} pallets)</option>`).join('')}
        </select>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">${t('zones_city_pattern')}</label><input class="form-input" id="editZoneCityPattern" value="${zone.city_pattern || ''}"></div>
        <div class="form-group"><label class="form-label">${t('zones_zip_codes')}</label>
          <div id="editZoneZipContainer" class="zip-tag-container">
            ${existingZips.map(z => `<span class="zip-tag">${z}<button type="button" onclick="this.parentElement.remove();updateEditZoneZipInput()">&times;</button></span>`).join('')}
            <input class="zip-tag-input" id="editZoneZipInput" placeholder="Add ZIP..." onkeydown="handleZipKeydown(event,'editZoneZipContainer','editZoneZipInput','updateEditZoneZipInput')">
          </div>
          <input type="hidden" id="editZoneZipCodes" value="${zone.zip_codes || ''}">
        </div>
        <div class="form-group"><label class="form-label">${t('zones_center')}</label><input class="form-input" id="editZoneCenter" value="${zone.center_lat && zone.center_lng ? zone.center_lat + ', ' + zone.center_lng : ''}"></div>
      </div>
      <div class="form-group" style="position:relative">
        <div id="editZonePickerMap" style="height:280px;border-radius:8px;border:1px solid var(--gray-200)"></div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:4px"><i class="fas fa-mouse-pointer"></i> ${t('zones_click_to_set')}</div>
      </div>
      <div class="form-group"><label class="form-label">${t('zones_notes')}</label><textarea class="form-textarea" id="editZoneNotes" rows="2">${zone.notes || ''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="cleanupEditZoneMap();this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitEditZone(${id})"><i class="fas fa-save"></i> ${t('common_save')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  // Use requestAnimationFrame + timeout chain to ensure DOM is painted before map init
  requestAnimationFrame(() => {
    setTimeout(() => initEditZoneMap(zone), 150);
  });
}

function cleanupEditZoneMap() {
  if (window._editZoneMap) { window._editZoneMap = null; }
  if (window._editZoneObserver) { try { window._editZoneObserver.disconnect(); } catch(e) {} window._editZoneObserver = null; }
}

function initEditZoneMap(zone) {
  const mapEl = document.getElementById('editZonePickerMap');
  if (!mapEl || !window.__gmapsLoaded) return;
  if (mapEl.offsetWidth === 0 || mapEl.offsetHeight === 0) {
    setTimeout(() => initEditZoneMap(zone), 200);
    return;
  }
  const depot = window.__DEPOT || DEPOT;
  const center = zone.center_lat && zone.center_lng ? { lat: zone.center_lat, lng: zone.center_lng } : { lat: depot.lat, lng: depot.lng };
  mapEl.innerHTML = '';
  const map = new google.maps.Map(mapEl, { center, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
  window._editZoneMap = map;

  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, opacity: 0.7, title: 'BF Distribution Center' });

  let centerMarker = zone.center_lat ? new google.maps.Marker({ position: { lat: zone.center_lat, lng: zone.center_lng }, map }) : null;
  let radiusCircle = zone.center_lat ? new google.maps.Circle({ center: { lat: zone.center_lat, lng: zone.center_lng }, radius: (zone.radius_miles || 5) * 1609.34, strokeColor: zone.color, fillColor: zone.color, fillOpacity: 0.15, strokeWeight: 2, map }) : null;

  map.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    document.getElementById('editZoneCenter').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (centerMarker) centerMarker.setMap(null);
    if (radiusCircle) radiusCircle.setMap(null);
    const color = document.getElementById('editZoneColor').value;
    const radius = parseFloat(document.getElementById('editZoneRadius').value) || 5;
    centerMarker = new google.maps.Marker({ position: { lat, lng }, map });
    radiusCircle = new google.maps.Circle({ center: { lat, lng }, radius: radius * 1609.34, strokeColor: color, fillColor: color, fillOpacity: 0.15, strokeWeight: 2, map });
  });

  // ResizeObserver for modal transitions
  const observer = new ResizeObserver(() => { google.maps.event.trigger(map, 'resize'); });
  observer.observe(mapEl);
  window._editZoneObserver = observer;
}

function handleZipKeydown(e, containerId, inputId, updateFn) {
  const input = document.getElementById(inputId);
  if ((e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') && input.value.trim()) {
    e.preventDefault();
    const zip = input.value.replace(/[, ]/g, '').trim();
    if (zip && /^\d{3,10}$/.test(zip)) {
      const container = document.getElementById(containerId);
      const tag = document.createElement('span');
      tag.className = 'zip-tag';
      tag.innerHTML = `${zip}<button type="button" onclick="this.parentElement.remove();${updateFn}()">&times;</button>`;
      container.insertBefore(tag, input);
      input.value = '';
      window[updateFn]();
    }
  }
}

function updateEditZoneZipInput() {
  const tags = document.querySelectorAll('#editZoneZipContainer .zip-tag');
  const zips = Array.from(tags).map(t => t.textContent.replace('\u00d7','').trim());
  document.getElementById('editZoneZipCodes').value = zips.join(',');
}

function updateNewZoneZipInput() {
  const tags = document.querySelectorAll('#newZoneZipContainer .zip-tag');
  const zips = Array.from(tags).map(t => t.textContent.replace('\u00d7','').trim());
  document.getElementById('newZoneZipCodes').value = zips.join(',');
}

async function submitEditZone(id) {
  const name = document.getElementById('editZoneName').value.trim();
  if (!name) { showToast('Please enter a zone name', 'warning'); return; }
  const selectedDays = Array.from(document.querySelectorAll('.edit-zone-day-btn.btn-primary')).map(b => b.getAttribute('data-day'));
  if (selectedDays.length === 0) { showToast('Please select delivery days', 'warning'); return; }
  const centerVal = document.getElementById('editZoneCenter').value.trim();
  let center_lat = null, center_lng = null;
  if (centerVal) {
    const parts = centerVal.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) { center_lat = parts[0]; center_lng = parts[1]; }
  }
  // Collect zip codes from tags
  updateEditZoneZipInput();
  try {
    const editTruckVal = document.getElementById('editZoneDefaultTruck')?.value;
    await API.put(`/zones/${id}`, {
      name,
      color: document.getElementById('editZoneColor').value,
      delivery_days: selectedDays.join(','),
      radius_miles: parseFloat(document.getElementById('editZoneRadius').value) || 5,
      center_lat, center_lng,
      city_pattern: document.getElementById('editZoneCityPattern').value.trim() || null,
      zip_codes: document.getElementById('editZoneZipCodes').value.trim() || null,
      notes: document.getElementById('editZoneNotes').value.trim() || null,
      default_truck_id: editTruckVal ? parseInt(editTruckVal) : null,
    });
    cleanupEditZoneMap();
    document.querySelector('.modal-overlay.edit-zone-modal')?.remove();
    showToast('Zone updated!');
    navigate('zones', { viewId: id });
  } catch (err) { showToast('Failed to update zone', 'error'); }
}

async function deleteZone(id) {
  if (!confirm(t('zones_delete_confirm'))) return;
  try {
    await API.delete(`/zones/${id}`);
    showToast('Zone deleted');
    navigate('zones');
  } catch (err) { showToast('Failed to delete zone', 'error'); }
}

async function autoAssignZones() {
  try {
    const { data } = await API.post('/zones/auto-assign');
    showToast(`${data.assigned} ${t('zones_assigned')}!`);
    renderZones();
  } catch (err) { showToast('Failed to auto-assign', 'error'); }
}

// ==================== TRANSLATE INSTRUCTIONS INLINE ====================
async function translateInstructionInline(btn, text, lang) {
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const apiKey = localStorage.getItem('bf_openai_key') || '';
    const { data } = await API.post('/translate-instructions', { text, target_lang: lang, api_key: apiKey || undefined });
    const langLabel = lang === 'es' ? 'Español' : 'Kreyòl';
    // Find the instructions text container (sibling)
    const container = btn.closest('div').parentElement;
    const textEl = container.querySelector('[id^="instrText"]') || container.querySelector('div:last-child');
    if (textEl) {
      textEl.innerHTML = `<div style="margin-bottom:6px">${data.translated}</div>
        <div style="font-size:11px;color:var(--gray-400);border-top:1px dashed var(--gray-200);padding-top:4px;margin-top:4px">
          <strong>${t('translate_original')}:</strong> ${text}
        </div>
        <span class="badge" style="background:#DBEAFE;color:#1E40AF;font-size:10px;margin-top:4px"><i class="fas fa-language"></i> ${langLabel}</span>`;
    }
    showToast(`Translated to ${langLabel}`);
  } catch (err) {
    showToast('Translation failed - check AI Settings for API key', 'error');
  }
  btn.disabled = false;
  btn.innerHTML = origHTML;
}

// (AI Dispatch Rules removed — replaced by AI Learning Engine)
async function renderDispatchRules() { document.getElementById('pageContent').innerHTML = '<div class="empty-state" style="padding:60px"><i class="fas fa-brain" style="font-size:48px;color:var(--gray-300)"></i><h3>This feature has been replaced by the AI Learning Engine</h3><button class="btn btn-primary" onclick="navigate(\'learning\')"><i class="fas fa-brain"></i> Go to AI Learning</button></div>'; }
/* LEGACY DISPATCH STUBS — kept for backward compat */
function buildRuleJSON() { return {}; } function ruleConfigHTML() { return ''; } function showNewDispatchRuleModal() { navigate('learning'); } function submitNewDispatchRule() {} function showEditDispatchRuleModal() {} function submitEditDispatchRule() {} function deleteDispatchRule() {}
// ==================== END LEGACY DISPATCH STUBS ====================

// ==================== PRODUCT EDIT MODAL (WITH DIMENSIONS) ====================
async function showEditProductModal(id) {
  const { data } = await API.get('/products');
  const p = data.products.find(pr => pr.id === id);
  if (!p) { showToast('Product not found', 'error'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:700px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-edit" style="color:var(--navy-light)"></i> ${t('prod_edit')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="editProdName" value="${p.name}"></div>
        <div class="form-group"><label class="form-label">SKU</label><input class="form-input" id="editProdSku" value="${p.sku||''}"></div></div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-select" id="editProdCat">${['horse','cattle','poultry','goat','swine','supplement','other'].map(c=>`<option value="${c}" ${p.category===c?'selected':''}>${c}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Weight/Unit (lbs)</label><input class="form-input" type="number" id="editProdWeight" value="${p.weight_per_unit}"></div>
        <div class="form-group"><label class="form-label">Unit Type</label><input class="form-input" id="editProdUnit" value="${p.unit_type||'bag'}"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Price ($)</label><input class="form-input" type="number" step="0.01" id="editProdPrice" value="${p.price||0}"></div>
        <div class="form-group"><label class="form-label">Stock Qty</label><input class="form-input" type="number" id="editProdStock" value="${p.stock_quantity||0}"></div>
        <div></div>
      </div>

      <div style="border-top:1px solid var(--gray-200);margin:16px 0;padding-top:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px"><i class="fas fa-shopping-bag" style="color:var(--orange);margin-right:6px"></i> Individual Bag/Unit Dimensions</h4>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">Bag Length (in)</label><input class="form-input" type="number" step="0.1" id="editProdBagL" value="${p.bag_length_in||0}" oninput="autoCalcPalletDims('edit')"></div>
          <div class="form-group"><label class="form-label">Bag Width (in)</label><input class="form-input" type="number" step="0.1" id="editProdBagW" value="${p.bag_width_in||0}" oninput="autoCalcPalletDims('edit')"></div>
          <div class="form-group"><label class="form-label">Bag Height (in)</label><input class="form-input" type="number" step="0.1" id="editProdBagH" value="${p.bag_height_in||0}" oninput="autoCalcPalletDims('edit')"></div>
        </div>
        <div id="editProdAutoCalc" style="font-size:11px;color:var(--gray-500);padding:6px 10px;background:var(--gray-50);border-radius:6px;margin-bottom:12px;display:${(p.bag_length_in&&p.bag_width_in&&p.bag_height_in)?'block':'none'}"></div>
      </div>
      <div style="border-top:1px solid var(--gray-200);margin:16px 0;padding-top:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px"><i class="fas fa-cube" style="color:var(--orange);margin-right:6px"></i> ${t('prod_dimensions')}</h4>
        <div style="font-size:11px;color:var(--gray-400);margin-bottom:12px">Set manually or auto-calculated from bag dimensions above</div>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">${t('prod_pallet_qty')}</label><input class="form-input" type="number" id="editProdPalletQty" value="${p.pallet_qty||0}" placeholder="e.g. 40"></div>
          <div class="form-group"><label class="form-label">${t('prod_pallet_weight')}</label><input class="form-input" type="number" id="editProdPalletWeight" value="${p.pallet_weight||0}"></div>
          <div></div>
        </div>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">${t('prod_length')}</label><input class="form-input" type="number" step="0.1" id="editProdLength" value="${p.length_in||0}"></div>
          <div class="form-group"><label class="form-label">${t('prod_width')}</label><input class="form-input" type="number" step="0.1" id="editProdWidth" value="${p.width_in||0}"></div>
          <div class="form-group"><label class="form-label">${t('prod_height')}</label><input class="form-input" type="number" step="0.1" id="editProdHeight" value="${p.height_in||0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${t('prod_stackable')}</label>
            <select class="form-select" id="editProdStackable"><option value="1" ${p.stackable?'selected':''}>Yes</option><option value="0" ${!p.stackable?'selected':''}>No</option></select>
          </div>
          <div class="form-group"><label class="form-label">${t('prod_max_stack')}</label><input class="form-input" type="number" id="editProdMaxStack" value="${p.max_stack||3}" min="1" max="10"></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitEditProduct(${id})"><i class="fas fa-save"></i> ${t('common_save')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  // Trigger auto-calc if bag dimensions exist
  if (p.bag_length_in && p.bag_width_in && p.bag_height_in) {
    setTimeout(() => autoCalcPalletDims('edit'), 100);
  }
}

async function submitEditProduct(id) {
  const name = document.getElementById('editProdName').value.trim();
  if (!name) { showToast('Product name required', 'warning'); return; }
  try {
    await API.put(`/products/${id}`, {
      name,
      sku: document.getElementById('editProdSku').value.trim() || null,
      category: document.getElementById('editProdCat').value,
      weight_per_unit: parseFloat(document.getElementById('editProdWeight').value) || 50,
      unit_type: document.getElementById('editProdUnit').value || 'bag',
      price: parseFloat(document.getElementById('editProdPrice').value) || 0,
      stock_quantity: parseInt(document.getElementById('editProdStock').value) || 0,
      pallet_qty: parseInt(document.getElementById('editProdPalletQty').value) || 0,
      pallet_weight: parseFloat(document.getElementById('editProdPalletWeight').value) || 0,
      length_in: parseFloat(document.getElementById('editProdLength').value) || 0,
      width_in: parseFloat(document.getElementById('editProdWidth').value) || 0,
      height_in: parseFloat(document.getElementById('editProdHeight').value) || 0,
      stackable: parseInt(document.getElementById('editProdStackable').value),
      max_stack: parseInt(document.getElementById('editProdMaxStack').value) || 3,
      bag_length_in: parseFloat(document.getElementById('editProdBagL')?.value) || 0,
      bag_width_in: parseFloat(document.getElementById('editProdBagW')?.value) || 0,
      bag_height_in: parseFloat(document.getElementById('editProdBagH')?.value) || 0,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Product updated!');
    renderProducts();
  } catch (err) { showToast('Failed to update product', 'error'); }
}

// ==================== TRUCK LOADING OPTIMIZER UI ====================
async function showTruckLoadingPlan(routeId) {
  const { data: routeData } = await API.get(`/routes/${routeId}`);
  const r = routeData.route;
  const stops = routeData.stops || [];
  if (!r.truck_id) { showToast('No truck assigned to this route', 'warning'); return; }
  const orderIds = stops.map(s => s.order_id);
  if (orderIds.length === 0) { showToast('No stops in this route', 'warning'); return; }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg" style="max-width:900px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-truck-loading" style="color:var(--orange)"></i> ${t('loading_title')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body" id="loadingPlanContent">
      <div style="text-align:center;padding:30px"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--navy-light)"></i><p style="margin-top:8px">Calculating optimal loading plan...</p></div>
    </div>
  </div>`;
  document.body.appendChild(modal);

  try {
    const { data } = await API.post(`/trucks/${r.truck_id}/optimize-load`, { order_ids: orderIds });
    const plan = data.loading_plan || [];
    const summary = data.summary || {};
    const warnings = data.warnings || [];
    const truck = data.truck || {};

    document.getElementById('loadingPlanContent').innerHTML = `
      <!-- Summary -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--gray-50);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--navy)">${summary.total_pallets||0}</div>
          <div style="font-size:11px;color:var(--gray-500)">Pallets (of ${truck.max_pallets||12})</div>
          <div class="weight-bar" style="margin-top:4px"><div class="weight-bar-fill ${summary.pallet_pct>90?'danger':summary.pallet_pct>70?'warning':'safe'}" style="width:${Math.min(summary.pallet_pct||0,100)}%"></div></div>
        </div>
        <div style="background:var(--gray-50);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--navy)">${summary.pallet_pct||0}%</div>
          <div style="font-size:11px;color:var(--gray-500)">Pallet Utilization</div>
        </div>
        <div style="background:var(--gray-50);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--navy)">${truck.name||'—'}</div>
          <div style="font-size:11px;color:var(--gray-500)">${truck.max_pallets||12} pallet capacity</div>
        </div>
      </div>

      ${warnings.length > 0 ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px;margin-bottom:16px">
        <strong style="color:#991B1B;font-size:13px"><i class="fas fa-exclamation-triangle"></i> ${t('loading_warnings')}</strong>
        ${warnings.map(w => `<div style="font-size:12px;color:#991B1B;margin-top:4px">&bull; ${w}</div>`).join('')}
      </div>` : ''}

      <!-- Loading Plan -->
      <div style="border:1px solid var(--gray-200);border-radius:8px;overflow:hidden">
        <div style="background:var(--navy);color:white;padding:8px 12px;font-size:12px;font-weight:700;display:flex;gap:4px;align-items:center"><i class="fas fa-truck"></i> Loading Items</div>
        <table><thead><tr><th>Stop</th><th>Product</th><th>Qty</th><th>Unit</th><th>Pallets</th></tr></thead>
        <tbody>
          ${plan.map((p,i) => `<tr>
            <td><strong style="font-size:12px">${p.business_name}</strong><div style="font-size:11px;color:var(--gray-400)">Stop #${p.delivery_sequence} — ${p.order_number}</div></td>
            <td>${p.product||'—'}</td>
            <td style="font-weight:700">${p.quantity||'—'}</td>
            <td>${p.unit||'bags'}</td>
            <td>${p.pallets_used||'—'}${p.per_pallet ? `<div style="font-size:10px;color:var(--gray-400)">${p.per_pallet}/pallet</div>`:''}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>

      ${data.applied_rules?.length > 0 ? `<div style="margin-top:12px;font-size:11px;color:var(--gray-400)">
        <strong>Applied rules:</strong> ${data.applied_rules.map(r => r.name).join(' • ')}
      </div>` : ''}`;
  } catch (err) {
    document.getElementById('loadingPlanContent').innerHTML = `<div style="text-align:center;padding:20px;color:var(--red)"><i class="fas fa-exclamation-triangle"></i> Failed to generate loading plan</div>`;
  }
}

// ==================== CUSTOMERS PAGE ====================
// ==================== GEOCODING FUNCTIONS ====================
async function geocodeSingleAddress(addrId, context, contextId) {
  showToast('Calculating coordinates...', 'info');
  try {
    const { data } = await API.post(`/addresses/${addrId}/geocode`);
    if (data.success) {
      showToast(`Coordinates found: ${Number(data.lat).toFixed(4)}, ${Number(data.lng).toFixed(4)}`, 'success');
      // Refresh the right page
      if (context === 'customer' && contextId) renderCustomerDetail(contextId);
      else if (context === 'order' && contextId) renderOrderDetail(contextId);
      else if (window._params?.viewId) renderCustomerDetail(window._params.viewId);
    } else {
      showToast('Could not find coordinates for this address. Check street and city.', 'warning');
    }
  } catch (err) {
    showToast('Geocoding failed: ' + (err.response?.data?.error || err.message), 'error');
  }
}

async function geocodeAllAddresses() {
  if (!confirm('Calculate coordinates for all addresses that are missing them? This may take a moment (1 address per second).')) return;
  showToast('Geocoding all addresses...', 'info');
  try {
    const { data } = await API.post('/addresses/geocode-all');
    if (data.total === 0) {
      showToast('All addresses already have coordinates!', 'success');
    } else {
      showToast(`Done! ${data.geocoded} of ${data.total} addresses geocoded.${data.failed > 0 ? ` ${data.failed} could not be found.` : ''}`, data.failed > 0 ? 'warning' : 'success');
    }
    renderCustomers();
  } catch (err) {
    showToast('Batch geocoding failed: ' + (err.response?.data?.error || err.message), 'error');
  }
}

function customerRowHTML(c) {
  const typeIcons = { farm: 'fa-tractor', ranch: 'fa-horse', equestrian: 'fa-horse-head', retail: 'fa-store', other: 'fa-building' };
  const missingBadge = c.missing_coords > 0
    ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:#FEF2F2;color:#DC2626;margin-left:6px;white-space:nowrap" title="${c.missing_coords} address${c.missing_coords>1?'es':''} missing GPS coordinates"><i class="fas fa-map-marker-alt" style="margin-right:2px"></i><i class="fas fa-exclamation" style="font-size:7px;margin-right:3px"></i>${c.missing_coords} no GPS</span>`
    : (c.address_count > 0 ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:#DCFCE7;color:#16A34A;margin-left:6px;white-space:nowrap"><i class="fas fa-map-pin" style="margin-right:2px"></i>OK</span>` : '');
  return `<tr onclick="navigate('customers',{viewId:${c.id}})" ${!c.active?'style="opacity:0.5"':''}>
    <td><i class="fas ${typeIcons[c.customer_type]||'fa-building'}" style="color:var(--navy-light);margin-right:8px"></i><strong>${c.business_name}</strong>${!c.active?archiveBadge():''}${missingBadge}</td>
    <td>${c.contact_name||'-'}</td>
    <td>${c.phone||'-'}</td>
    <td>${statusBadge(c.customer_type)}</td>
    <td>${c.preferred_truck_name ? `<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:#EFF6FF;color:var(--navy);font-weight:600"><i class="fas fa-truck" style="font-size:9px"></i> ${c.preferred_truck_name}</span>` : '<span style="color:var(--gray-300)">—</span>'}</td>
    <td><span class="badge badge-normal">${c.order_count} orders</span></td>
    <td><i class="fas fa-chevron-right" style="color:var(--gray-400)"></i></td>
  </tr>`;
}

function missingCoordsBanner(customers) {
  const missing = customers.filter(c => c.missing_coords > 0);
  if (missing.length === 0) return '';
  const totalAddr = missing.reduce((s, c) => s + c.missing_coords, 0);
  return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;margin-bottom:12px">
    <div style="width:36px;height:36px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-map-marker-alt" style="color:#DC2626;font-size:16px"></i></div>
    <div style="flex:1">
      <div style="font-weight:700;color:#991B1B;font-size:13px">${totalAddr} address${totalAddr>1?'es':''} across ${missing.length} customer${missing.length>1?'s':''} missing GPS coordinates</div>
      <div style="font-size:12px;color:#B91C1C;margin-top:2px">These won't appear on route maps. Click a customer to geocode or use <strong>Geocode All</strong>.</div>
    </div>
    <button class="btn btn-outline btn-sm" style="border-color:#DC2626;color:#DC2626;white-space:nowrap" onclick="geocodeAllAddresses()"><i class="fas fa-crosshairs"></i> Fix All</button>
  </div>`;
}

async function renderCustomers() {
  const pc = document.getElementById('pageContent');
  if (window._params?.viewId) { return renderCustomerDetail(window._params.viewId); }
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const showArchived = _archiveToggles.customers || false;
  const { data } = await API.get('/customers' + (showArchived ? '?include_archived=1' : ''));
  pc.innerHTML = `
    <div class="filters-bar no-print">
      <div class="search-bar" style="flex:1;max-width:320px"><i class="fas fa-search"></i><input class="form-input" placeholder="Search customers..." id="custSearch" onkeyup="filterCustomers()"></div>
      <select class="form-select" style="width:160px" id="custTypeFilter" onchange="filterCustomers()">
        <option value="">All Types</option><option value="farm">Farm</option><option value="ranch">Ranch</option><option value="equestrian">Equestrian</option><option value="retail">Retail</option>
      </select>
      <select class="form-select" style="width:170px" id="custCoordsFilter" onchange="filterCustomers()">
        <option value="">All Coordinates</option><option value="missing">Missing GPS Only</option><option value="ok">Has GPS Only</option>
      </select>
      ${archiveToggleBtn(showArchived, "toggleArchive('customers','renderCustomers')")}
      <button class="btn btn-outline" onclick="geocodeAllAddresses()" title="Calculate coordinates for all addresses missing them"><i class="fas fa-crosshairs"></i> Geocode All</button>
      <button class="btn btn-primary" onclick="showNewCustomerModal()"><i class="fas fa-plus"></i> New Customer</button>
    </div>
    <div id="missingCoordsBanner">${missingCoordsBanner(data.customers)}</div>
    <div class="card">
      <div class="table-container">
        <table><thead><tr><th>Business</th><th>Contact</th><th>Phone</th><th>Type</th><th>Truck</th><th>Orders</th><th></th></tr></thead>
        <tbody id="customersTableBody">
          ${data.customers.map(c => customerRowHTML(c)).join('')}
        </tbody></table>
      </div>
    </div>`;
}

async function filterCustomers() {
  const search = document.getElementById('custSearch')?.value || '';
  const type = document.getElementById('custTypeFilter')?.value || '';
  const coordsFilter = document.getElementById('custCoordsFilter')?.value || '';
  const showArchived = _archiveToggles.customers || false;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  if (showArchived) params.set('include_archived', '1');
  const { data } = await API.get(`/customers?${params}`);
  let filtered = data.customers;
  if (coordsFilter === 'missing') filtered = filtered.filter(c => c.missing_coords > 0);
  else if (coordsFilter === 'ok') filtered = filtered.filter(c => c.missing_coords === 0 && c.address_count > 0);
  document.getElementById('customersTableBody').innerHTML = filtered.map(c => customerRowHTML(c)).join('');
  const banner = document.getElementById('missingCoordsBanner');
  if (banner) banner.innerHTML = missingCoordsBanner(data.customers);
}

async function renderCustomerDetail(id) {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const [{ data }] = await Promise.all([API.get(`/customers/${id}`), ensureDriversCache()]);
  const c = data.customer;
  pc.innerHTML = `
    <div class="no-print" style="margin-bottom:16px">
      <button class="btn btn-outline" onclick="navigate('customers')"><i class="fas fa-arrow-left"></i> Back</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header"><h3 class="card-title">${c.business_name}${!c.active?archiveBadge():''}</h3>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="showCustomerLearningProfile(${c.id}, '${c.business_name.replace(/'/g, "\\'")}')" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:600"><i class="fas fa-brain"></i> AI Insights</button>
            <button class="btn btn-outline btn-sm" onclick="showEditCustomerModal(${c.id})"><i class="fas fa-edit"></i> Edit</button>
            ${archiveActionBtn('customers', c.id, !c.active, 'renderCustomers')}
          </div>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div><div class="form-label">Contact</div><div>${c.contact_name||'-'}</div></div>
            <div><div class="form-label">Phone</div><div>${c.phone||'-'}</div></div>
            <div><div class="form-label">Email</div><div>${c.email||'-'}</div></div>
            <div><div class="form-label">Type</div><div>${statusBadge(c.customer_type)}</div></div>
          </div>
          ${c.preferred_truck_id ? `<div style="margin-top:12px;padding:10px;background:#EFF6FF;border-radius:8px;border-left:3px solid var(--navy-light)"><div class="form-label"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:4px"></i> Required Truck</div><div style="font-size:14px;font-weight:600;color:var(--navy)">${c.preferred_truck_name || 'Truck #' + c.preferred_truck_id}</div></div>` : ''}
          ${c.notes?`<div style="margin-top:12px;padding:10px;background:var(--gray-50);border-radius:8px"><div class="form-label">Notes</div><div style="font-size:14px">${c.notes}</div></div>`:''}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Delivery Addresses</h3>
          <button class="btn btn-outline btn-sm" onclick="showNewAddressForCustomer(${c.id})"><i class="fas fa-plus"></i> Add Address</button>
        </div>
        <div class="card-body">
          ${data.addresses.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--gray-400)"><i class="fas fa-map-marker-alt" style="font-size:24px"></i><div style="margin-top:8px">No addresses yet</div></div>' : ''}
          ${data.addresses.map(a => `<div style="padding:12px;border:1px solid var(--gray-200);border-radius:10px;margin-bottom:8px;transition:box-shadow 0.15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <strong style="color:var(--navy)">${a.label || 'Address'}</strong>
                ${a.is_primary?'<span class="badge badge-confirmed" style="font-size:10px">Primary</span>':''}
                ${a.zone_id ? '<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:#EDE9FE;color:#7C3AED"><i class="fas fa-map-location-dot"></i> Zone</span>' : ''}
              </div>
              <div style="display:flex;gap:4px;align-items:center">
                ${a.lat && a.lng ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:#DCFCE7;color:#16A34A"><i class="fas fa-map-pin"></i> ${Number(a.lat).toFixed(4)}, ${Number(a.lng).toFixed(4)}</span>` : `<button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px;color:var(--orange);border-color:var(--orange)" onclick="event.stopPropagation();geocodeSingleAddress(${a.id},'customer',${c.id})"><i class="fas fa-crosshairs"></i> Geocode</button><button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px;color:#2563EB;border-color:#2563EB" onclick="event.stopPropagation();showPinDropModal(${a.id},null,${c.id})"><i class="fas fa-map-pin"></i> Pin</button>`}
                <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();showEditAddressModal(${a.id}, null, ${c.id})" title="Edit address"><i class="fas fa-pen"></i></button>
                <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px;color:#DC2626;border-color:#DC2626" onclick="event.stopPropagation();deleteAddress(${a.id}, ${c.id})" title="Delete address"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div style="font-size:13px;color:var(--gray-600)"><i class="fas fa-location-dot" style="color:var(--gray-400);margin-right:4px"></i>${a.street}, ${a.city}, ${a.state} ${a.zip||''}</div>
            ${a.gate_code?`<div style="font-size:12px;color:var(--orange);margin-top:4px"><i class="fas fa-key" style="margin-right:4px"></i>Gate: ${a.gate_code}</div>`:''}
            ${a.driver_notes?`<div style="font-size:12px;color:var(--gray-500);margin-top:2px"><i class="fas fa-sticky-note" style="margin-right:4px"></i>${a.driver_notes}</div>`:''}
            ${a.truck_requirement || a.driver_restrictions ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${truckReqBadge(a.truck_requirement)} ${driverRestrictionBadges(a.driver_restrictions, false)}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3 class="card-title">Order History</h3></div>
      <div class="table-container">
        <table><thead><tr><th>Order</th><th>Date</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody>${data.orders.map(o => `<tr onclick="navigate('orders',{viewId:${o.id}})">
          <td><strong>${o.order_number}</strong></td><td>${formatDate(o.scheduled_date)}</td>
          <td>${priorityBadge(o.priority)}</td><td>${statusBadge(o.status)}</td>
        </tr>`).join('')}</tbody></table>
      </div>
    </div>`;
}

async function showNewCustomerModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-header"><h3 class="modal-title">New Customer</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Business Name *</label><input class="form-input" id="newCustName" placeholder="e.g. Green Meadows Farm"></div>
        <div class="form-group"><label class="form-label">Contact Name</label><input class="form-input" id="newCustContact"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="newCustPhone" placeholder="561-555-1234"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="newCustEmail"></div>
        <div class="form-group"><label class="form-label">Type</label>
          <select class="form-select" id="newCustType"><option value="farm">Farm</option><option value="ranch">Ranch</option><option value="equestrian">Equestrian</option><option value="retail">Retail</option><option value="other">Other</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="newCustNotes" rows="2"></textarea></div>
      <h4 style="font-weight:700;margin:16px 0 12px;padding-top:16px;border-top:1px solid var(--gray-200)">Primary Address</h4>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Street</label><input class="form-input" id="newCustStreet"></div>
        <div class="form-group"><label class="form-label">City</label><input class="form-input" id="newCustCity" value="Loxahatchee Groves"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">State</label><input class="form-input" id="newCustState" value="FL"></div>
        <div class="form-group"><label class="form-label">ZIP</label><input class="form-input" id="newCustZip"></div>
        <div class="form-group"><label class="form-label">Gate Code</label><input class="form-input" id="newCustGate"></div>
      </div>
      <div class="form-group"><label class="form-label">Driver Notes</label><textarea class="form-textarea" id="newCustDriverNotes" rows="2" placeholder="e.g. Big dog in yard, use side entrance..."></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewCustomer()"><i class="fas fa-check"></i> Create Customer</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewCustomer() {
  const name = document.getElementById('newCustName').value;
  if (!name) { showToast('Business name is required', 'warning'); return; }
  try {
    const payload = {
      business_name: name,
      contact_name: document.getElementById('newCustContact').value || null,
      phone: document.getElementById('newCustPhone').value || null,
      email: document.getElementById('newCustEmail').value || null,
      customer_type: document.getElementById('newCustType').value,
      notes: document.getElementById('newCustNotes').value || null,
    };
    const street = document.getElementById('newCustStreet').value;
    if (street) {
      payload.address = {
        street,
        city: document.getElementById('newCustCity').value || '',
        state: document.getElementById('newCustState').value || 'FL',
        zip: document.getElementById('newCustZip').value || null,
        gate_code: document.getElementById('newCustGate').value || null,
        driver_notes: document.getElementById('newCustDriverNotes').value || null,
      };
    }
    const { data } = await API.post('/customers', payload);
    document.querySelector('.modal-overlay').remove();
    showToast('Customer created!');
    navigate('customers', { viewId: data.id });
  } catch (err) { showToast('Failed to create customer', 'error'); }
}

// showEditCustomerModal is defined in the ORDER DETAIL section below (supports both order page and customer page)

// ==================== PRODUCTS PAGE ====================
async function renderProducts() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const showArchived = _archiveToggles.products || false;
  const { data } = await API.get('/products' + (showArchived ? '?include_archived=1' : ''));
  const catIcons = { horse: 'fa-horse-head', cattle: 'fa-cow', poultry: 'fa-egg', swine: 'fa-piggy-bank', goat: 'fa-paw', supplement: 'fa-flask', other: 'fa-box' };
  pc.innerHTML = `
    <div class="filters-bar no-print">
      <div class="search-bar" style="flex:1;max-width:320px"><i class="fas fa-search"></i><input class="form-input" placeholder="Search products..." id="prodSearch" onkeyup="filterProducts()"></div>
      <select class="form-select" style="width:160px" id="prodCatFilter" onchange="filterProducts()">
        <option value="">All Categories</option><option value="horse">Horse</option><option value="cattle">Cattle</option>
        <option value="poultry">Poultry</option><option value="goat">Goat</option><option value="swine">Swine</option><option value="supplement">Supplement</option>
      </select>
      ${archiveToggleBtn(showArchived, "toggleArchive('products','renderProducts')")}
      <button class="btn btn-primary" onclick="showNewProductModal()"><i class="fas fa-plus"></i> New Product</button>
    </div>
    <div class="card">
      <div class="table-container">
        <table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Unit</th><th>Pallet Info</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
        <tbody id="productsTableBody">
          ${data.products.map(p => {
            const stockStatus = p.stock_quantity <= 0 ? 'out' : p.stock_quantity < 20 ? 'low' : 'ok';
            const stockBadge = stockStatus === 'out' ? '<span class="badge badge-cancelled">Out of Stock</span>' : stockStatus === 'low' ? '<span class="badge badge-urgent">Low Stock</span>' : '<span class="badge badge-confirmed">In Stock</span>';
            const palletInfo = p.pallet_qty ? `${p.pallet_qty}/pallet` : '-';
            const dims = (p.length_in && p.width_in && p.height_in) ? `<div style="font-size:10px;color:var(--gray-400)">${p.length_in}"x${p.width_in}"x${p.height_in}"</div>` : '';
            return `<tr ${!p.active?'style="opacity:0.5"':''}>
              <td><i class="fas ${catIcons[p.category]||'fa-box'}" style="color:var(--navy-light);margin-right:8px"></i><strong>${p.name}</strong>${!p.active?archiveBadge():''}</td>
              <td><code style="font-size:12px">${p.sku||'-'}</code></td>
              <td>${statusBadge(p.category)}</td>
              <td>${p.unit_type}</td>
              <td>${palletInfo}${dims}</td>
              <td>$${(p.price||0).toFixed(2)}</td>
              <td>${p.stock_quantity}</td>
              <td>${stockBadge}</td>
              <td style="display:flex;gap:4px">
                <button class="btn btn-outline btn-sm" onclick="showEditProductModal(${p.id})" title="Edit"><i class="fas fa-edit"></i></button>
                ${archiveActionBtn('products', p.id, !p.active, 'renderProducts')}
              </td>
            </tr>`;
          }).join('')}
        </tbody></table>
      </div>
    </div>`;
}

async function filterProducts() {
  const search = document.getElementById('prodSearch')?.value || '';
  const category = document.getElementById('prodCatFilter')?.value || '';
  const showArchived = _archiveToggles.products || false;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (showArchived) params.set('include_archived', '1');
  const { data } = await API.get(`/products?${params}`);
  const catIcons = { horse: 'fa-horse-head', cattle: 'fa-cow', poultry: 'fa-egg', swine: 'fa-piggy-bank', goat: 'fa-paw', supplement: 'fa-flask', other: 'fa-box' };
  document.getElementById('productsTableBody').innerHTML = data.products.map(p => {
    const stockStatus = p.stock_quantity <= 0 ? 'out' : p.stock_quantity < 20 ? 'low' : 'ok';
    const stockBadge = stockStatus === 'out' ? '<span class="badge badge-cancelled">Out of Stock</span>' : stockStatus === 'low' ? '<span class="badge badge-urgent">Low Stock</span>' : '<span class="badge badge-confirmed">In Stock</span>';
    const palletInfo = p.pallet_qty ? `${p.pallet_qty}/pallet` : '-';
    const dims = (p.length_in && p.width_in && p.height_in) ? `<div style="font-size:10px;color:var(--gray-400)">${p.length_in}"x${p.width_in}"x${p.height_in}"</div>` : '';
    return `<tr ${!p.active?'style="opacity:0.5"':''}><td><i class="fas ${catIcons[p.category]||'fa-box'}" style="color:var(--navy-light);margin-right:8px"></i><strong>${p.name}</strong>${!p.active?archiveBadge():''}</td>
      <td><code style="font-size:12px">${p.sku||'-'}</code></td><td>${statusBadge(p.category)}</td>
      <td>${p.unit_type}</td><td>${palletInfo}${dims}</td><td>$${(p.price||0).toFixed(2)}</td><td>${p.stock_quantity}</td><td>${stockBadge}</td>
      <td style="display:flex;gap:4px"><button class="btn btn-outline btn-sm" onclick="showEditProductModal(${p.id})" title="Edit"><i class="fas fa-edit"></i></button>${archiveActionBtn('products', p.id, !p.active, 'renderProducts')}</td></tr>`;
  }).join('');
}

async function showNewProductModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:700px">
    <div class="modal-header"><h3 class="modal-title">New Product</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="newProdName"></div>
        <div class="form-group"><label class="form-label">SKU</label><input class="form-input" id="newProdSku"></div></div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-select" id="newProdCat"><option value="horse">Horse</option><option value="cattle">Cattle</option><option value="poultry">Poultry</option><option value="goat">Goat</option><option value="swine">Swine</option><option value="supplement">Supplement</option><option value="other">Other</option></select>
        </div>
        <div class="form-group"><label class="form-label">Weight/Unit (lbs)</label><input class="form-input" type="number" id="newProdWeight" value="50"></div>
        <div class="form-group"><label class="form-label">Unit Type</label><input class="form-input" id="newProdUnit" value="bag"></div>
      </div>
      <div class="form-row"><div class="form-group"><label class="form-label">Price ($)</label><input class="form-input" type="number" step="0.01" id="newProdPrice"></div>
        <div class="form-group"><label class="form-label">Stock Qty</label><input class="form-input" type="number" id="newProdStock" value="0"></div></div>
      <div style="border-top:1px solid var(--gray-200);margin:16px 0;padding-top:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px"><i class="fas fa-shopping-bag" style="color:var(--orange);margin-right:6px"></i> ${t('prod_bag_dims') || 'Individual Bag/Unit Dimensions'}</h4>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">${t('prod_bag_length') || 'Bag Length (in)'}</label><input class="form-input" type="number" step="0.1" id="newProdBagL" value="0" oninput="autoCalcPalletDims('new')"></div>
          <div class="form-group"><label class="form-label">${t('prod_bag_width') || 'Bag Width (in)'}</label><input class="form-input" type="number" step="0.1" id="newProdBagW" value="0" oninput="autoCalcPalletDims('new')"></div>
          <div class="form-group"><label class="form-label">${t('prod_bag_height') || 'Bag Height (in)'}</label><input class="form-input" type="number" step="0.1" id="newProdBagH" value="0" oninput="autoCalcPalletDims('new')"></div>
        </div>
        <div id="newProdAutoCalc" style="font-size:11px;color:var(--gray-500);padding:6px 10px;background:var(--gray-50);border-radius:6px;margin-bottom:12px;display:none"></div>
      </div>
      <div style="border-top:1px solid var(--gray-200);margin:16px 0;padding-top:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px"><i class="fas fa-cube" style="color:var(--orange);margin-right:6px"></i> ${t('prod_dimensions')}</h4>
        <div style="font-size:11px;color:var(--gray-400);margin-bottom:12px">${t('prod_auto_calc') || 'Set manually or auto-calculated from bag dimensions above'}</div>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">${t('prod_pallet_qty')}</label><input class="form-input" type="number" id="newProdPalletQty" value="0" placeholder="e.g. 40"></div>
          <div class="form-group"><label class="form-label">${t('prod_pallet_weight')}</label><input class="form-input" type="number" id="newProdPalletWeight" value="0"></div>
          <div></div>
        </div>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">${t('prod_length')}</label><input class="form-input" type="number" step="0.1" id="newProdLength" value="0"></div>
          <div class="form-group"><label class="form-label">${t('prod_width')}</label><input class="form-input" type="number" step="0.1" id="newProdWidth" value="0"></div>
          <div class="form-group"><label class="form-label">${t('prod_height')}</label><input class="form-input" type="number" step="0.1" id="newProdHeight" value="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${t('prod_stackable')}</label>
            <select class="form-select" id="newProdStackable"><option value="1" selected>Yes</option><option value="0">No</option></select>
          </div>
          <div class="form-group"><label class="form-label">${t('prod_max_stack')}</label><input class="form-input" type="number" id="newProdMaxStack" value="3" min="1" max="10"></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewProduct()"><i class="fas fa-check"></i> Create Product</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewProduct() {
  const name = document.getElementById('newProdName').value;
  if (!name) { showToast('Product name required', 'warning'); return; }
  try {
    await API.post('/products', {
      name, sku: document.getElementById('newProdSku').value,
      category: document.getElementById('newProdCat').value,
      weight_per_unit: parseFloat(document.getElementById('newProdWeight').value) || 50,
      unit_type: document.getElementById('newProdUnit').value || 'bag',
      price: parseFloat(document.getElementById('newProdPrice').value) || 0,
      stock_quantity: parseInt(document.getElementById('newProdStock').value) || 0,
      pallet_qty: parseInt(document.getElementById('newProdPalletQty').value) || 0,
      pallet_weight: parseFloat(document.getElementById('newProdPalletWeight').value) || 0,
      length_in: parseFloat(document.getElementById('newProdLength').value) || 0,
      width_in: parseFloat(document.getElementById('newProdWidth').value) || 0,
      height_in: parseFloat(document.getElementById('newProdHeight').value) || 0,
      stackable: parseInt(document.getElementById('newProdStackable').value),
      max_stack: parseInt(document.getElementById('newProdMaxStack').value) || 3,
      bag_length_in: parseFloat(document.getElementById('newProdBagL')?.value) || 0,
      bag_width_in: parseFloat(document.getElementById('newProdBagW')?.value) || 0,
      bag_height_in: parseFloat(document.getElementById('newProdBagH')?.value) || 0,
    });
    document.querySelector('.modal-overlay').remove();
    showToast('Product created!');
    renderProducts();
  } catch (err) { showToast('Failed to create product', 'error'); }
}

// ==================== TRUCKS PAGE ====================
async function renderTrucks() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const showArchived = _archiveToggles.trucks || false;
  const [trucksResp, zonesResp] = await Promise.all([
    API.get('/trucks' + (showArchived ? '?include_archived=1' : '')),
    API.get('/zones')
  ]);
  const data = trucksResp.data;
  window._truckZones = zonesResp.data.zones || [];
  pc.innerHTML = `
    <div class="filters-bar no-print">
      ${archiveToggleBtn(showArchived, "toggleArchive('trucks','renderTrucks')")}
      <button class="btn btn-primary" onclick="showNewTruckModal()"><i class="fas fa-plus"></i> Add Truck</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
      ${data.trucks.map(tk => `<div class="card" ${tk.archived?'style="opacity:0.5"':''}>
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <h3 style="font-size:18px;font-weight:700"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:8px"></i>${tk.name}${tk.archived?archiveBadge():''}</h3>
              <div style="font-size:13px;color:var(--gray-500);margin-top:2px">${tk.plate_number||'No plate'}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              ${statusBadge(tk.status)}
              <button class="btn btn-outline btn-sm" onclick="showEditTruckModal(${tk.id})" title="Edit"><i class="fas fa-edit"></i></button>
              ${archiveActionBtn('trucks', tk.id, tk.archived, 'renderTrucks')}
            </div>
          </div>
          <div style="margin-bottom:8px">
            <span style="font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600;${tk.truck_type==='bale'?'background:#FEF3C7;color:#92400E':'background:#EFF6FF;color:var(--navy)'}">${tk.truck_type==='bale'?'<i class=\"fas fa-truck-pickup\"></i> Small Truck':'<i class=\"fas fa-truck\"></i> Large Truck'}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:13px">
            <div><div class="form-label" style="font-size:11px">${tk.truck_type==='bale'?'Unit Capacity':'Pallet Capacity'}</div><strong>${tk.truck_type==='bale'? (tk.bale_capacity||0)+' units' : (tk.max_pallet_spots||12)+' pallets'}</strong></div>
            <div><div class="form-label" style="font-size:11px">Active Routes</div><strong>${tk.active_routes||0}</strong></div>
            <div><div class="form-label" style="font-size:11px">Delivery Zone</div>${tk.zone_name ? `<span style="font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600;background:${tk.zone_color||'#2563EB'}20;color:${tk.zone_color||'#2563EB'}"><i class="fas fa-map-location-dot"></i> ${tk.zone_name}</span>` : '<span style="color:var(--gray-300)">—</span>'}</div>
          </div>
          ${tk.verizon_vehicle_id ? `<div style="margin-top:8px;padding:6px 10px;background:linear-gradient(135deg,#F5F3FF,#EDE9FE);border-radius:8px;font-size:12px;display:flex;align-items:center;gap:6px"><i class="fas fa-satellite-dish" style="color:#7C3AED"></i> <strong style="color:#7C3AED">Verizon Linked</strong> <span style="color:var(--gray-500)">#${tk.verizon_vehicle_number||''} · ${tk.make||''} ${tk.model||''} ${tk.year||''}</span></div>` : `<div style="margin-top:8px;font-size:11px;color:var(--gray-400)"><i class="fas fa-unlink"></i> Not linked to Verizon — <a href="#" onclick="event.preventDefault();navigate('fleet_sync')" style="color:#7C3AED;text-decoration:underline">link now</a></div>`}
          ${tk.notes?`<div style="margin-top:8px;font-size:13px;color:var(--gray-500)"><i class="fas fa-info-circle"></i> ${tk.notes}</div>`:''}
        </div>
      </div>`).join('')}
    </div>`;
}

async function showNewTruckModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:650px">
    <div class="modal-header"><h3 class="modal-title">Add Truck</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="newTruckName" placeholder="e.g. Double Door"></div>
        <div class="form-group"><label class="form-label">Plate Number</label><input class="form-input" id="newTruckPlate"></div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Truck Type</label>
          <select class="form-select" id="newTruckType" onchange="document.getElementById('newTruckPalletGroup').style.display=this.value==='pallet'?'':'none';document.getElementById('newTruckUnitGroup').style.display=this.value==='bale'?'':'none'">
            <option value="pallet">Large Truck (Pallet)</option><option value="bale">Small Truck (Bale/Unit)</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="newTruckStatus"><option value="available">Available</option><option value="maintenance">Maintenance</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="newTruckPalletGroup"><label class="form-label"><i class="fas fa-pallet" style="margin-right:4px;color:var(--navy-light)"></i>Pallet Capacity</label><input class="form-input" type="number" id="newTruckPallets" value="12"></div>
        <div class="form-group" id="newTruckUnitGroup" style="display:none"><label class="form-label"><i class="fas fa-box" style="margin-right:4px;color:#D97706"></i>Unit Capacity</label><input class="form-input" type="number" id="newTruckUnits" value="175" placeholder="e.g. 175, 210"></div>
      </div>
      <div class="form-group"><label class="form-label"><i class="fas fa-map-location-dot" style="color:var(--navy-light);margin-right:4px"></i> Delivery Zone</label>
        <select class="form-select" id="newTruckZone">
          <option value="">No zone assigned</option>
          ${(window._truckZones||[]).map(z => `<option value="${z.id}">${z.name} (${z.delivery_days})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="newTruckNotes" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewTruck()"><i class="fas fa-check"></i> Add Truck</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewTruck() {
  const name = document.getElementById('newTruckName').value;
  if (!name) { showToast('Truck name required', 'warning'); return; }
  const truckType = document.getElementById('newTruckType').value;
  try {
    const zoneVal = document.getElementById('newTruckZone')?.value;
    await API.post('/trucks', {
      name, plate_number: document.getElementById('newTruckPlate').value,
      truck_type: truckType,
      max_pallet_spots: truckType === 'pallet' ? (parseInt(document.getElementById('newTruckPallets').value) || 12) : 0,
      bale_capacity: truckType === 'bale' ? (parseInt(document.getElementById('newTruckUnits').value) || 175) : 0,
      status: document.getElementById('newTruckStatus').value,
      notes: document.getElementById('newTruckNotes').value,
      zone_id: zoneVal ? parseInt(zoneVal) : null,
    });
    document.querySelector('.modal-overlay').remove();
    showToast('Truck added!');
    renderTrucks();
  } catch (err) { showToast('Failed to add truck', 'error'); }
}

async function showEditTruckModal(id) {
  const { data } = await API.get('/trucks');
  const tk = data.trucks.find(t => t.id === id);
  if (!tk) { showToast('Truck not found', 'error'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:650px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-edit" style="color:var(--navy-light)"></i> Edit Truck</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="editTruckName" value="${tk.name}"></div>
        <div class="form-group"><label class="form-label">Plate Number</label><input class="form-input" id="editTruckPlate" value="${tk.plate_number||''}"></div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Truck Type</label>
          <select class="form-select" id="editTruckType" onchange="document.getElementById('editTruckPalletGroup').style.display=this.value==='pallet'?'':'none';document.getElementById('editTruckUnitGroup').style.display=this.value==='bale'?'':'none'">
            <option value="pallet" ${tk.truck_type!=='bale'?'selected':''}>Large Truck (Pallet)</option><option value="bale" ${tk.truck_type==='bale'?'selected':''}>Small Truck (Bale/Unit)</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="editTruckStatus">${['available','in_use','maintenance','retired'].map(s=>`<option value="${s}" ${tk.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="editTruckPalletGroup" style="${tk.truck_type==='bale'?'display:none':''}"><label class="form-label"><i class="fas fa-pallet" style="margin-right:4px;color:var(--navy-light)"></i>Pallet Capacity</label><input class="form-input" type="number" id="editTruckPallets" value="${tk.max_pallet_spots||12}"></div>
        <div class="form-group" id="editTruckUnitGroup" style="${tk.truck_type==='bale'?'':'display:none'}"><label class="form-label"><i class="fas fa-box" style="margin-right:4px;color:#D97706"></i>Unit Capacity</label><input class="form-input" type="number" id="editTruckUnits" value="${tk.bale_capacity||175}" placeholder="e.g. 175, 210"></div>
      </div>
      <div class="form-group"><label class="form-label"><i class="fas fa-map-location-dot" style="color:var(--navy-light);margin-right:4px"></i> Delivery Zone</label>
        <select class="form-select" id="editTruckZone">
          <option value="">No zone assigned</option>
          ${(window._truckZones||[]).map(z => `<option value="${z.id}" ${tk.zone_id==z.id?'selected':''}>${z.name} (${z.delivery_days})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="editTruckNotes" rows="2">${tk.notes||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditTruck(${id})"><i class="fas fa-save"></i> ${t('common_save')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitEditTruck(id) {
  const name = document.getElementById('editTruckName').value.trim();
  if (!name) { showToast('Truck name required', 'warning'); return; }
  const truckType = document.getElementById('editTruckType').value;
  try {
    await API.put(`/trucks/${id}`, {
      name,
      plate_number: document.getElementById('editTruckPlate').value || null,
      truck_type: truckType,
      max_pallet_spots: truckType === 'pallet' ? (parseInt(document.getElementById('editTruckPallets').value) || 12) : 0,
      bale_capacity: truckType === 'bale' ? (parseInt(document.getElementById('editTruckUnits').value) || 175) : 0,
      status: document.getElementById('editTruckStatus').value,
      notes: document.getElementById('editTruckNotes').value || null,
      zone_id: document.getElementById('editTruckZone')?.value ? parseInt(document.getElementById('editTruckZone').value) : null,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Truck updated!');
    renderTrucks();
  } catch (err) { showToast('Failed to update truck', 'error'); }
}

// ==================== BULK ORDER UPLOAD ====================
var BULK_CSV_TEMPLATE = `customer,product,quantity,priority,date,notes
Green Meadows Farm,Tribute Essential K,40,normal,,
Triple S Ranch,SafeChoice Original,80,high,2026-04-10,Gate code: 1234
Palm Beach Equestrian,Purina Strategy GX,60,normal,,Leave by barn`;

var BULK_JSON_TEMPLATE = `[
  {
    "customer": "Green Meadows Farm",
    "items": [
      { "product": "Tribute Essential K", "quantity": 40 },
      { "product": "SafeChoice Original", "quantity": 20 }
    ],
    "priority": "normal",
    "date": "",
    "notes": ""
  },
  {
    "customer": "Triple S Ranch",
    "items": [
      { "product": "Bermuda Hay Bale", "quantity": 36 }
    ],
    "priority": "high",
    "notes": "Gate code: 5678"
  }
]`;

function showBulkUpload() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'bulkUploadModal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:1100px;max-height:95vh;overflow:hidden;display:flex;flex-direction:column">
    <div class="modal-header" style="background:linear-gradient(135deg,#EDE9FE,#DDD6FE);border-bottom:2px solid #7C3AED">
      <h3 class="modal-title"><i class="fas fa-file-upload" style="color:#7C3AED;margin-right:8px"></i> Bulk Order Upload</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body" style="overflow-y:auto;flex:1;padding:20px">
      <!-- Step indicator -->
      <div id="bulkStepIndicator" style="display:flex;justify-content:center;gap:8px;margin-bottom:20px">
        <div class="bulk-step active" id="bulkStep1"><span class="bulk-step-num">1</span> Upload Data</div>
        <div class="bulk-step-arrow"><i class="fas fa-chevron-right"></i></div>
        <div class="bulk-step" id="bulkStep2"><span class="bulk-step-num">2</span> Review & Fix</div>
        <div class="bulk-step-arrow"><i class="fas fa-chevron-right"></i></div>
        <div class="bulk-step" id="bulkStep3"><span class="bulk-step-num">3</span> Confirm & Plan</div>
      </div>

      <!-- STEP 1: Data Input -->
      <div id="bulkStep1Content">
        <div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);padding:16px;border-radius:12px;margin-bottom:16px">
          <div style="font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-info-circle" style="color:var(--navy-light)"></i> How it works</div>
          <div style="font-size:13px;color:var(--gray-600);line-height:1.6">
            Paste or upload your orders in <strong>CSV</strong> or <strong>JSON</strong> format. The system will automatically
            match customer names and products to your existing data. After reviewing, you can create all orders and optionally
            <strong>auto-plan routes</strong> based on your zones and trucks.
          </div>
        </div>

        <!-- Format tabs -->
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-sm" id="bulkTabCSV" style="background:#7C3AED;color:white;font-weight:600" onclick="switchBulkTab('csv')"><i class="fas fa-file-csv"></i> CSV / Paste</button>
          <button class="btn btn-sm btn-outline" id="bulkTabJSON" onclick="switchBulkTab('json')"><i class="fas fa-code"></i> JSON</button>
          <button class="btn btn-sm btn-outline" id="bulkTabFile" onclick="switchBulkTab('file')"><i class="fas fa-upload"></i> Upload File</button>
        </div>

        <!-- CSV Tab -->
        <div id="bulkCSVPanel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label class="form-label" style="margin:0">Paste CSV data (header row + orders)</label>
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('bulkCSVInput').value=BULK_CSV_TEMPLATE" style="font-size:11px"><i class="fas fa-paste"></i> Load Example</button>
          </div>
          <textarea id="bulkCSVInput" class="form-input" rows="10" style="font-family:monospace;font-size:12px;white-space:pre;resize:vertical"
            placeholder="customer,product,quantity,priority,date,notes&#10;Green Meadows Farm,Tribute Essential K,40,normal,,&#10;Triple S Ranch,SafeChoice Original,80,high,2026-04-10,Gate code: 1234"></textarea>
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px">
            <strong>Columns:</strong> customer (required), product, quantity, priority (normal/high/urgent), date (YYYY-MM-DD), notes
            <br>For multiple products per customer, use multiple rows with the same customer name.
          </div>
        </div>

        <!-- JSON Tab -->
        <div id="bulkJSONPanel" style="display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label class="form-label" style="margin:0">Paste JSON array of orders</label>
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('bulkJSONInput').value=BULK_JSON_TEMPLATE" style="font-size:11px"><i class="fas fa-paste"></i> Load Example</button>
          </div>
          <textarea id="bulkJSONInput" class="form-input" rows="10" style="font-family:monospace;font-size:12px;white-space:pre;resize:vertical"
            placeholder='[{"customer":"Farm Name","items":[{"product":"Product Name","quantity":40}],"priority":"normal"}]'></textarea>
        </div>

        <!-- File Upload Tab -->
        <div id="bulkFilePanel" style="display:none">
          <div style="border:2px dashed var(--gray-300);border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:all 0.2s" 
               onclick="document.getElementById('bulkFileInput').click()"
               ondragover="event.preventDefault();this.style.borderColor='#7C3AED';this.style.background='#F5F3FF'"
               ondragleave="this.style.borderColor='var(--gray-300)';this.style.background=''"
               ondrop="event.preventDefault();this.style.borderColor='var(--gray-300)';this.style.background='';handleBulkFile(event.dataTransfer.files[0])">
            <i class="fas fa-cloud-upload-alt" style="font-size:48px;color:var(--gray-300)"></i>
            <div style="margin-top:12px;font-weight:600;color:var(--gray-600)">Drop a CSV file here or click to browse</div>
            <div style="font-size:12px;color:var(--gray-400);margin-top:4px">Supports .csv and .txt files</div>
          </div>
          <input type="file" id="bulkFileInput" accept=".csv,.txt,.json" style="display:none" onchange="handleBulkFile(this.files[0])">
          <div id="bulkFileName" style="display:none;margin-top:8px;padding:8px 12px;background:var(--gray-50);border-radius:8px;font-size:13px">
            <i class="fas fa-file" style="color:#7C3AED"></i> <span id="bulkFileNameText"></span>
          </div>
        </div>

        <div style="margin-top:16px;text-align:center">
          <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700;font-size:15px;padding:12px 32px" onclick="parseBulkData()">
            <i class="fas fa-magic"></i> Parse & Match Orders
          </button>
        </div>
      </div>

      <!-- STEP 2: Review & Fix -->
      <div id="bulkStep2Content" style="display:none">
        <div id="bulkSummaryBar"></div>
        <div id="bulkReviewTable" style="margin-top:12px"></div>
        <div style="display:flex;justify-content:space-between;margin-top:16px">
          <button class="btn btn-outline" onclick="goToBulkStep(1)"><i class="fas fa-arrow-left"></i> Back to Edit</button>
          <button class="btn" style="background:linear-gradient(135deg,#059669,#047857);color:white;font-weight:700;font-size:15px;padding:10px 32px" id="bulkConfirmBtn" onclick="confirmBulkUpload()">
            <i class="fas fa-check-double"></i> Create <span id="bulkConfirmCount">0</span> Orders
          </button>
        </div>
      </div>

      <!-- STEP 3: Confirm & Plan Routes -->
      <div id="bulkStep3Content" style="display:none">
        <div id="bulkSuccessResult"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);

  // Add CSS for step indicator
  if (!document.getElementById('bulkUploadCSS')) {
    const style = document.createElement('style');
    style.id = 'bulkUploadCSS';
    style.textContent = `
      .bulk-step { display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;color:var(--gray-400);background:var(--gray-50);transition:all 0.2s }
      .bulk-step.active { background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white }
      .bulk-step.done { background:#D1FAE5;color:#065F46 }
      .bulk-step-num { width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:rgba(255,255,255,0.3) }
      .bulk-step.active .bulk-step-num { background:rgba(255,255,255,0.3) }
      .bulk-step.done .bulk-step-num { background:#059669;color:white }
      .bulk-step-arrow { display:flex;align-items:center;color:var(--gray-300);font-size:11px }
      .bulk-review-row { display:grid;grid-template-columns:40px 1.2fr 1.5fr 0.6fr 0.6fr 0.6fr 0.4fr;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--gray-100);font-size:12px }
      .bulk-review-row:hover { background:var(--gray-50) }
      .bulk-review-header { font-weight:700;color:var(--gray-500);font-size:11px;text-transform:uppercase;background:var(--gray-50);border-radius:8px 8px 0 0 }
      .bulk-match-badge { display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600 }
      .bulk-match-good { background:#D1FAE5;color:#065F46 }
      .bulk-match-warn { background:#FEF3C7;color:#92400E }
      .bulk-match-error { background:#FEE2E2;color:#991B1B }
      @media(max-width:768px) {
        .bulk-review-row { grid-template-columns:30px 1fr 1fr auto;font-size:11px }
        .bulk-review-row > :nth-child(5),.bulk-review-row > :nth-child(6) { display:none }
      }
    `;
    document.head.appendChild(style);
  }
}

function switchBulkTab(tab) {
  document.getElementById('bulkCSVPanel').style.display = tab === 'csv' ? '' : 'none';
  document.getElementById('bulkJSONPanel').style.display = tab === 'json' ? '' : 'none';
  document.getElementById('bulkFilePanel').style.display = tab === 'file' ? '' : 'none';
  document.getElementById('bulkTabCSV').className = tab === 'csv' ? 'btn btn-sm' : 'btn btn-sm btn-outline';
  document.getElementById('bulkTabCSV').style.background = tab === 'csv' ? '#7C3AED' : '';
  document.getElementById('bulkTabCSV').style.color = tab === 'csv' ? 'white' : '';
  document.getElementById('bulkTabJSON').className = tab === 'json' ? 'btn btn-sm' : 'btn btn-sm btn-outline';
  document.getElementById('bulkTabJSON').style.background = tab === 'json' ? '#7C3AED' : '';
  document.getElementById('bulkTabJSON').style.color = tab === 'json' ? 'white' : '';
  document.getElementById('bulkTabFile').className = tab === 'file' ? 'btn btn-sm' : 'btn btn-sm btn-outline';
  document.getElementById('bulkTabFile').style.background = tab === 'file' ? '#7C3AED' : '';
  document.getElementById('bulkTabFile').style.color = tab === 'file' ? 'white' : '';
}

function handleBulkFile(file) {
  if (!file) return;
  document.getElementById('bulkFileName').style.display = 'block';
  document.getElementById('bulkFileNameText').textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    if (file.name.endsWith('.json')) {
      document.getElementById('bulkJSONInput').value = text;
      switchBulkTab('json');
    } else {
      document.getElementById('bulkCSVInput').value = text;
      switchBulkTab('csv');
    }
  };
  reader.readAsText(file);
}

function parseBulkCSVtoOrders(csvText) {
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const colMap = {};
  const knownCols = ['customer','customer_name','business_name','farm','product','product_name','quantity','qty','priority','date','scheduled_date','notes','special_instructions','order_number','ticket_number'];
  header.forEach((h, i) => {
    const match = knownCols.find(k => k === h || h.includes(k));
    if (match) colMap[match] = i;
    else colMap[h] = i;
  });

  // Group rows by customer (merge items)
  const orderMap = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV fields
    const row = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { row.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    row.push(current.trim());

    const getCol = (...keys) => {
      for (const k of keys) {
        if (colMap[k] !== undefined && row[colMap[k]]) return row[colMap[k]];
      }
      return '';
    };

    const customer = getCol('customer', 'customer_name', 'business_name', 'farm');
    const product = getCol('product', 'product_name');
    const quantity = parseInt(getCol('quantity', 'qty')) || 1;
    const priority = getCol('priority') || 'normal';
    const date = getCol('date', 'scheduled_date') || null;
    const notes = getCol('notes', 'special_instructions') || '';
    const orderNum = getCol('order_number', 'ticket_number') || null;

    if (!customer) continue;

    // Use customer+date+priority as grouping key to merge items
    const key = customer + '|' + (date || '') + '|' + priority;
    if (orderMap.has(key)) {
      const existing = orderMap.get(key);
      if (product) existing.items.push({ product, quantity });
      if (notes && !existing.notes.includes(notes)) existing.notes += (existing.notes ? '; ' : '') + notes;
      if (orderNum && !existing.order_number) existing.order_number = orderNum;
    } else {
      orderMap.set(key, {
        customer,
        items: product ? [{ product, quantity }] : [],
        priority,
        scheduled_date: date,
        notes,
        order_number: orderNum
      });
    }
  }

  return Array.from(orderMap.values());
}

async function parseBulkData() {
  let orders = [];
  
  // Determine which tab is active
  const csvPanel = document.getElementById('bulkCSVPanel');
  const jsonPanel = document.getElementById('bulkJSONPanel');
  
  if (csvPanel.style.display !== 'none') {
    const csvText = document.getElementById('bulkCSVInput').value.trim();
    if (!csvText) { showToast('Please paste CSV data first', 'warning'); return; }
    orders = parseBulkCSVtoOrders(csvText);
  } else if (jsonPanel.style.display !== 'none') {
    const jsonText = document.getElementById('bulkJSONInput').value.trim();
    if (!jsonText) { showToast('Please paste JSON data first', 'warning'); return; }
    try {
      orders = JSON.parse(jsonText);
      if (!Array.isArray(orders)) orders = [orders];
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
      return;
    }
  } else {
    // File tab - data should have been loaded into CSV or JSON panel
    const csvText = document.getElementById('bulkCSVInput').value.trim();
    const jsonText = document.getElementById('bulkJSONInput').value.trim();
    if (jsonText) {
      try { orders = JSON.parse(jsonText); if (!Array.isArray(orders)) orders = [orders]; }
      catch (e) { showToast('Invalid JSON in uploaded file', 'error'); return; }
    } else if (csvText) {
      orders = parseBulkCSVtoOrders(csvText);
    } else {
      showToast('Please upload or paste data first', 'warning');
      return;
    }
  }

  if (orders.length === 0) {
    showToast('No orders found in input data', 'warning');
    return;
  }

  // Show loading
  const btn = event.target.closest('button');
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Matching orders...';

  try {
    const { data } = await API.post('/orders/bulk-parse', { orders });
    window._bulkParsed = data;
    renderBulkReview(data);
    goToBulkStep(2);
  } catch (err) {
    showToast('Failed to parse orders: ' + (err.response?.data?.error || err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

function goToBulkStep(step) {
  document.getElementById('bulkStep1Content').style.display = step === 1 ? '' : 'none';
  document.getElementById('bulkStep2Content').style.display = step === 2 ? '' : 'none';
  document.getElementById('bulkStep3Content').style.display = step === 3 ? '' : 'none';
  
  ['bulkStep1','bulkStep2','bulkStep3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = 'bulk-step' + (i + 1 === step ? ' active' : (i + 1 < step ? ' done' : ''));
  });
}

function renderBulkReview(data) {
  const { parsed, summary, customers, products } = data;
  window._bulkCustomers = customers;
  window._bulkProducts = products;

  // Summary bar
  const summaryBar = document.getElementById('bulkSummaryBar');
  summaryBar.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
      <div style="flex:1;min-width:120px;padding:12px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--navy)">${summary.total}</div>
        <div style="font-size:11px;color:var(--gray-500)">Total Orders</div>
      </div>
      <div style="flex:1;min-width:120px;padding:12px;background:#D1FAE5;border-radius:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#065F46">${summary.ready}</div>
        <div style="font-size:11px;color:#065F46"><i class="fas fa-check-circle"></i> Ready</div>
      </div>
      ${summary.warnings > 0 ? `<div style="flex:1;min-width:120px;padding:12px;background:#FEF3C7;border-radius:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#92400E">${summary.warnings}</div>
        <div style="font-size:11px;color:#92400E"><i class="fas fa-exclamation-triangle"></i> Warnings</div>
      </div>` : ''}
      ${summary.errors > 0 ? `<div style="flex:1;min-width:120px;padding:12px;background:#FEE2E2;border-radius:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#991B1B">${summary.errors}</div>
        <div style="font-size:11px;color:#991B1B"><i class="fas fa-times-circle"></i> Errors</div>
      </div>` : ''}
    </div>`;

  // Build review table
  const table = document.getElementById('bulkReviewTable');
  let html = `
    <div style="border:1px solid var(--gray-200);border-radius:10px;overflow:hidden">
      <div class="bulk-review-row bulk-review-header">
        <div>#</div>
        <div>Customer</div>
        <div>Products</div>
        <div>Qty</div>
        <div>Priority</div>
        <div>Date</div>
        <div>Status</div>
      </div>`;

  for (const row of parsed) {
    const statusBadge = row.status === 'ready'
      ? '<span class="bulk-match-badge bulk-match-good"><i class="fas fa-check"></i></span>'
      : row.status === 'warning'
      ? '<span class="bulk-match-badge bulk-match-warn"><i class="fas fa-exclamation-triangle"></i></span>'
      : '<span class="bulk-match-badge bulk-match-error"><i class="fas fa-times"></i></span>';

    const custDisplay = row.customer_match
      ? `<div style="font-weight:600;color:var(--navy)">${escapeHtml(row.customer_match.name)}</div>
         ${row.customer_match.score < 1 ? `<div style="font-size:10px;color:var(--gray-400)">from: "${escapeHtml(row.customer_match.input)}"</div>` : ''}
         ${row.address_display ? `<div style="font-size:10px;color:var(--gray-400)"><i class="fas fa-map-pin"></i> ${escapeHtml(row.address_display)}</div>` : ''}`
      : `<div style="font-weight:600;color:#991B1B"><i class="fas fa-question-circle"></i> ${escapeHtml(row.input?.customer || row.input?.customer_name || row.input?.business_name || '?')}</div>
         <div style="font-size:10px;color:#991B1B">Not found - 
           <select class="form-select" style="display:inline;width:auto;font-size:11px;padding:1px 4px" onchange="fixBulkCustomer(${row.row - 1}, this.value)">
             <option value="">Select...</option>
             ${customers.map(c => `<option value="${c.id}">${c.business_name}</option>`).join('')}
           </select>
         </div>`;

    const itemsDisplay = row.items.length > 0
      ? row.items.map(item => {
          const matchCls = item.match_score >= 0.8 ? 'bulk-match-good' : item.match_score > 0 ? 'bulk-match-warn' : 'bulk-match-error';
          return `<div style="display:flex;align-items:center;gap:4px">
            <span class="bulk-match-badge ${matchCls}" style="padding:1px 4px;font-size:10px">${item.match_score >= 0.8 ? '✓' : item.match_score > 0 ? '~' : '✗'}</span>
            <span style="font-weight:500">${escapeHtml(item.product_name || item.input)}</span>
            <span style="color:var(--gray-400)">×${item.quantity}</span>
          </div>`;
        }).join('')
      : '<span style="color:var(--gray-400);font-size:11px">No products</span>';

    const totalQty = row.items.reduce((s, i) => s + (i.quantity || 0), 0);

    html += `<div class="bulk-review-row" data-row="${row.row - 1}" style="${row.status === 'error' ? 'background:#FEF2F2' : row.status === 'warning' ? 'background:#FFFBEB' : ''}">
      <div style="font-weight:700;color:var(--gray-400)">${row.row}</div>
      <div>${custDisplay}</div>
      <div>${itemsDisplay}</div>
      <div style="font-weight:700;text-align:center">${totalQty}</div>
      <div>${priorityBadge(row.priority)}</div>
      <div style="font-size:11px;color:var(--gray-500)">${row.scheduled_date || '<span style="color:var(--gray-300)">—</span>'}</div>
      <div>${statusBadge}</div>
    </div>`;

    // Show issues row if any
    if (row.issues.length > 0) {
      html += `<div style="padding:4px 12px 8px 52px;font-size:11px;color:${row.status === 'error' ? '#991B1B' : '#92400E'};background:${row.status === 'error' ? '#FEF2F2' : '#FFFBEB'};border-bottom:1px solid var(--gray-100)">
        ${row.issues.map(i => `<div><i class="fas fa-${row.status === 'error' ? 'times' : 'exclamation'}-circle" style="margin-right:4px"></i>${escapeHtml(i)}</div>`).join('')}
      </div>`;
    }
  }

  html += '</div>';
  table.innerHTML = html;

  // Update confirm button count
  const readyCount = parsed.filter(p => p.status !== 'error').length;
  document.getElementById('bulkConfirmCount').textContent = readyCount;
  document.getElementById('bulkConfirmBtn').disabled = readyCount === 0;
}

function fixBulkCustomer(rowIndex, customerId) {
  if (!window._bulkParsed || !customerId) return;
  const row = window._bulkParsed.parsed[rowIndex];
  if (!row) return;

  const customer = window._bulkCustomers.find(c => c.id == customerId);
  if (customer) {
    row.customer_match = { id: customer.id, name: customer.business_name, score: 1.0, input: 'manual' };
    // Remove error issues about customer
    row.issues = row.issues.filter(i => !i.includes('not found') && !i.includes('No customer'));
    if (row.issues.length === 0) row.status = row.items.some(i => !i.product_id) ? 'warning' : 'ready';
    else if (!row.issues.some(i => i.includes('error'))) row.status = 'warning';
  }

  // Re-render summary and table
  const summary = {
    total: window._bulkParsed.parsed.length,
    ready: window._bulkParsed.parsed.filter(p => p.status === 'ready').length,
    warnings: window._bulkParsed.parsed.filter(p => p.status === 'warning').length,
    errors: window._bulkParsed.parsed.filter(p => p.status === 'error').length,
  };
  window._bulkParsed.summary = summary;
  renderBulkReview(window._bulkParsed);
}

async function confirmBulkUpload() {
  if (!window._bulkParsed) return;
  const parsed = window._bulkParsed.parsed.filter(p => p.status !== 'error');
  if (parsed.length === 0) { showToast('No valid orders to create', 'warning'); return; }

  if (!confirm(`Create ${parsed.length} orders? Orders with warnings will be created with matched data.`)) return;

  const btn = document.getElementById('bulkConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating orders...';

  try {
    const ordersPayload = parsed.map(p => ({
      customer_id: p.customer_match?.id,
      address_id: p.address_id,
      items: p.items.filter(i => i.product_id).map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      priority: p.priority,
      scheduled_date: p.scheduled_date,
      order_number: p.order_number,
      special_instructions: p.special_instructions || (p.input?.notes || ''),
      created_by: currentUser?.id || null,
    }));

    const { data } = await API.post('/orders/bulk-confirm', { orders: ordersPayload });
    window._bulkResult = data;

    goToBulkStep(3);

    // Show success + prompt to plan routes
    const result = document.getElementById('bulkSuccessResult');
    result.innerHTML = `
      <div style="text-align:center;padding:20px">
        <div style="width:64px;height:64px;border-radius:50%;background:#D1FAE5;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
          <i class="fas fa-check" style="font-size:28px;color:#059669"></i>
        </div>
        <h2 style="font-size:24px;font-weight:800;color:var(--navy);margin-bottom:8px">Orders Created!</h2>
        <div style="font-size:15px;color:var(--gray-600);margin-bottom:4px">
          <strong>${data.created_count}</strong> order${data.created_count !== 1 ? 's' : ''} created successfully
          ${data.error_count > 0 ? `<br><span style="color:#DC2626">${data.error_count} failed</span>` : ''}
        </div>
      </div>

      <div style="background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-radius:16px;padding:24px;margin:20px 0;text-align:center;border:2px solid #F59E0B">
        <div style="font-size:18px;font-weight:800;color:#92400E;margin-bottom:8px">
          <i class="fas fa-hat-wizard" style="color:#D97706;margin-right:8px"></i> Ready to Plan Routes?
        </div>
        <div style="font-size:13px;color:#78350F;margin-bottom:16px;line-height:1.6">
          Your orders have been uploaded. Now let the system automatically create optimized routes based on your
          <strong>delivery zones</strong>, <strong>truck capacity</strong>, and <strong>zone delivery days</strong>.
        </div>
        <button class="btn" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:white;font-weight:700;font-size:16px;padding:14px 40px;border-radius:12px" onclick="launchAutoPlanFromBulk()">
          <i class="fas fa-bolt"></i> Auto-Plan Routes Now
        </button>
      </div>

      <div style="display:flex;gap:12px;justify-content:center;margin-top:16px">
        <button class="btn btn-outline" onclick="document.getElementById('bulkUploadModal')?.remove();renderOrders()">
          <i class="fas fa-list"></i> Go to Orders
        </button>
        <button class="btn btn-outline" onclick="document.getElementById('bulkUploadModal')?.remove();navigate('routes')">
          <i class="fas fa-route"></i> Go to Routes
        </button>
      </div>`;

    showToast(`${data.created_count} orders created!`, 'success');
  } catch (err) {
    showToast('Failed to create orders: ' + (err.response?.data?.error || err.message), 'error');
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-check-double"></i> Create ${parsed.length} Orders`;
  }
}

function launchAutoPlanFromBulk() {
  document.getElementById('bulkUploadModal')?.remove();
  // Navigate to routes page and open auto plan
  navigate('routes');
  setTimeout(() => showAutoPlan(), 500);
}

// ==================== AUTO ROUTE PLANNER (SINGLE-DAY) ====================
async function showAutoPlan() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'autoPlanModal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  // Default to tomorrow (skip Sunday)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];

  modal.innerHTML = `<div class="modal" style="max-width:1100px;max-height:95vh;overflow:hidden;display:flex;flex-direction:column">
    <div class="modal-header" style="background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-bottom:2px solid #F59E0B">
      <h3 class="modal-title"><i class="fas fa-hat-wizard" style="color:#D97706;margin-right:8px"></i> Plan Tomorrow's Deliveries</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body" style="overflow-y:auto;flex:1;padding:20px">
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
        <div class="form-group" style="margin:0;min-width:160px">
          <label class="form-label" style="margin-bottom:4px">Delivery Date</label>
          <input class="form-input" type="date" id="autoPlanDate" value="${defaultDate}" onchange="runAutoPlan()">
        </div>
        <div class="form-group" style="margin:0;min-width:130px">
          <label class="form-label" style="margin-bottom:4px">Max Stops/Route</label>
          <select class="form-select" id="autoPlanMaxStops">
            <option value="6">6 stops</option>
            <option value="8">8 stops</option>
            <option value="10" selected>10 stops</option>
            <option value="12">12 stops</option>
            <option value="15">15 stops</option>
          </select>
        </div>
        <button class="btn" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:white;font-weight:700;height:40px" onclick="runAutoPlan()">
          <i class="fas fa-bolt"></i> Generate Plan
        </button>
      </div>

      <div id="autoPlanResults" style="min-height:100px">
        <div class="empty-state" style="padding:40px">
          <i class="fas fa-route" style="font-size:48px;color:var(--gray-300)"></i>
          <h3 style="margin-top:12px;color:var(--gray-500)">Building routes...</h3>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  setTimeout(() => runAutoPlan(), 200);
}

async function runAutoPlan() {
  const container = document.getElementById('autoPlanResults');
  if (!container) return;
  const planDate = document.getElementById('autoPlanDate')?.value;
  const maxStops = parseInt(document.getElementById('autoPlanMaxStops')?.value) || 10;

  container.innerHTML = `<div style="text-align:center;padding:40px">
    <i class="fas fa-spinner fa-spin fa-2x" style="color:#D97706"></i>
    <div style="margin-top:12px;font-weight:600;color:var(--gray-600)">Building optimal routes for ${planDate}...</div>
    <div style="font-size:12px;color:var(--gray-400);margin-top:4px">Analyzing zones, capacity, and proximity</div>
  </div>`;

  try {
    const { data } = await API.post('/routes/auto-plan', {
      date: planDate,
      preferences: { max_stops_per_route: maxStops }
    });
    window._autoPlanData = data;

    // --- Header: date & zones active today ---
    let html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span style="font-size:18px;font-weight:800;color:var(--navy)"><i class="fas fa-calendar-day"></i> ${data.day_label}</span>
      ${data.zones_today.map(z => `<span style="font-size:11px;padding:3px 10px;border-radius:8px;font-weight:600;background:${z.color}20;color:${z.color}"><i class="fas fa-map-location-dot"></i> ${z.name}</span>`).join('')}
      ${data.zones_today.length === 0 ? '<span style="font-size:11px;color:var(--gray-400)"><i class="fas fa-info-circle"></i> No zones scheduled for this day</span>' : ''}
    </div>`;

    // --- EXISTING ROUTES for this date ---
    if (data.existing_routes.length > 0) {
      html += `<div style="margin-bottom:20px">
        <div style="font-weight:700;font-size:14px;color:var(--navy);margin-bottom:8px;display:flex;align-items:center;gap:8px">
          <i class="fas fa-check-circle" style="color:#059669"></i> Existing Routes for ${data.day_label}
          <span style="font-size:11px;padding:2px 8px;background:#D1FAE5;border-radius:8px;color:#065F46;font-weight:600">${data.existing_routes.length} already planned</span>
        </div>`;
      for (const rt of data.existing_routes) {
        const pPct = rt.truck_pallets ? Math.round(rt.used_pallets / rt.truck_pallets * 100) : 0;
        const pCls = pPct > 90 ? 'danger' : pPct > 70 ? 'warning' : 'safe';
        html += `<div class="card" style="margin-bottom:8px;border-left:4px solid #059669" id="existingRoute_${rt.id}">
          <div class="card-body" style="padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight:700;color:var(--navy)">${rt.route_number}</span>
                <span style="font-size:11px;color:var(--gray-500)"><i class="fas fa-truck"></i> ${rt.truck_name||'No truck'}</span>
                <span style="font-size:11px;color:var(--gray-500)"><i class="fas fa-user"></i> ${rt.driver_name||'No driver'}</span>
                <span class="badge badge-${rt.status==='planned'?'normal':'info'}" style="font-size:10px">${rt.status}</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <span style="font-size:12px;font-weight:600;color:var(--gray-500)">${rt.stops.length} stops</span>
                <span style="font-size:12px;font-weight:600;color:var(--gray-500)">${rt.used_pallets}/${rt.truck_pallets}p</span>
                ${rt.available_pallets > 0 ? `<span style="font-size:11px;font-weight:700;color:#059669">${rt.available_pallets}p free</span>` : '<span style="font-size:11px;font-weight:700;color:#DC2626">Full</span>'}
                <button class="btn btn-outline" style="font-size:10px;padding:3px 8px;border-radius:6px" onclick="reoptimizeExistingRoute(${rt.id})" title="Re-optimize stop order">
                  <i class="fas fa-route"></i> Optimize
                </button>
              </div>
            </div>
            <div class="weight-bar" style="width:100%;margin-bottom:6px"><div class="weight-bar-fill ${pCls}" style="width:${Math.min(pPct,100)}%"></div></div>
            <div style="display:flex;flex-direction:column;gap:3px">
              ${rt.stops.map((s, i) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 8px;border-radius:6px;background:${i%2===0?'#F9FAFB':'white'}">
                <span style="width:18px;height:18px;border-radius:50%;background:#059669;color:white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${s.sequence || i+1}</span>
                <span style="font-weight:600;color:var(--navy);min-width:70px">${s.order_number}</span>
                <span style="flex:1;color:var(--gray-600)">${s.business_name}</span>
                <span style="color:var(--gray-400);font-size:11px">${s.pallet_count||1}p</span>
              </div>`).join('')}
            </div>
            ${rt.available_pallets > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--gray-200)">
              <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;color:#7C3AED;border-color:#7C3AED" onclick="showAddToExistingRoute(${rt.id}, '${rt.route_number}', ${rt.available_pallets})">
                <i class="fas fa-plus"></i> Add order to this route
              </button>
            </div>` : ''}
          </div>
        </div>`;
      }
      html += '</div>';
    }

    // --- NEW ROUTES from unrouted orders ---
    const hasNewRoutes = data.new_routes.length > 0;
    const noUnrouted = data.unrouted_orders === 0;

    if (hasNewRoutes) {
      let totalStops = 0, totalPallets = 0, totalMiles = 0, totalItems = 0;
      data.new_routes.forEach(r => { totalStops += r.totals.stops; totalPallets += r.totals.pallets; totalMiles += r.totals.estimated_miles; totalItems += (r.totals.items||0); });

      html += `<div style="background:linear-gradient(135deg,#059669,#047857);border-radius:12px;padding:14px 16px;margin-bottom:12px;color:white">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:17px;font-weight:800"><i class="fas fa-plus-circle"></i> ${data.total_new_routes} New Route${data.total_new_routes>1?'s':''} Recommended</div>
            <div style="font-size:12px;opacity:0.9">${data.unrouted_orders} unrouted order${data.unrouted_orders>1?'s':''} optimized by zone & capacity</div>
          </div>
          <div style="display:flex;gap:14px;font-size:13px;font-weight:600">
            <span><i class="fas fa-map-pin"></i> ${totalStops} stops</span>
            <span><i class="fas fa-boxes-stacked"></i> ${totalItems} units</span>
            <span><i class="fas fa-pallet"></i> ${totalPallets}p</span>
            <span><i class="fas fa-road"></i> ${Math.round(totalMiles)} mi</span>
          </div>
        </div>
      </div>`;

      for (const route of data.new_routes) {
        const pPct = route.totals.pallets_pct;
        const pCls = pPct > 90 ? 'danger' : pPct > 70 ? 'warning' : 'safe';
        html += `<div class="card" style="margin-bottom:8px;border-left:4px solid ${route.zone_color||'var(--navy)'}">
          <div class="card-body" style="padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                ${route.zone_name ? `<span style="font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600;background:${route.zone_color||'#2563EB'}20;color:${route.zone_color||'#2563EB'}"><i class="fas fa-map-location-dot"></i> ${route.zone_name}</span>` : ''}
                <span style="font-size:12px;color:var(--gray-500)"><i class="fas fa-truck" style="color:var(--gray-400)"></i>
                  <select class="form-select" style="display:inline;width:auto;font-size:12px;padding:2px 6px;border-radius:6px" data-route-idx="${route.route_index}" onchange="updateAutoPlanTruck(this)">
                    ${data.trucks_available.map(t => `<option value="${t.id}" ${t.id===route.truck_id?'selected':''}>${t.name} (${t.pallets}p)</option>`).join('')}
                    <option value="" ${!route.truck_id?'selected':''}>Unassigned</option>
                  </select>
                </span>
                <span style="font-size:12px;color:var(--gray-500)"><i class="fas fa-user" style="color:var(--gray-400)"></i>
                  <select class="form-select" style="display:inline;width:auto;font-size:12px;padding:2px 6px;border-radius:6px" data-route-idx="${route.route_index}" onchange="updateAutoPlanDriver(this)">
                    ${data.drivers_available.map(d => `<option value="${d.id}" ${d.id===route.driver_id?'selected':''}>${d.name}</option>`).join('')}
                    <option value="" ${!route.driver_id?'selected':''}>Unassigned</option>
                  </select>
                </span>
              </div>
              <div style="display:flex;gap:10px;font-size:12px;font-weight:600;color:var(--gray-600)">
                <span><i class="fas fa-map-pin" style="color:var(--navy-light)"></i> ${route.totals.stops}</span>
                <span><i class="fas fa-boxes-stacked"></i> ${route.totals.items||0} units</span>
                <span><i class="fas fa-pallet"></i> ${route.totals.pallets}p (${pPct}%)</span>
                <span><i class="fas fa-road"></i> ${route.totals.estimated_miles} mi</span>
                <span><i class="fas fa-gas-pump"></i> ~$${route.totals.estimated_fuel_cost}</span>
              </div>
            </div>
            <div class="weight-bar" style="width:100%;margin-bottom:8px"><div class="weight-bar-fill ${pCls}" style="width:${Math.min(pPct,100)}%"></div></div>
            <div style="display:flex;flex-direction:column;gap:3px">
              ${route.orders.map((o,i) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 8px;border-radius:6px;background:${i%2===0?'#F9FAFB':'white'}">
                <span style="width:20px;height:20px;border-radius:50%;background:var(--navy);color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${o.sequence}</span>
                <span style="font-weight:600;color:var(--navy);min-width:70px">${o.order_number}</span>
                <span style="flex:1;color:var(--gray-600)">${o.business_name}</span>
                <span style="color:var(--gray-400);font-size:11px">${o.city||''}</span>
                ${o.priority==='urgent'?'<span style="background:#FEE2E2;color:#991B1B;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:700">URGENT</span>':''}
                ${o.priority==='high'?'<span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:700">HIGH</span>':''}
                <span style="color:var(--gray-400);font-size:11px">${o.item_count||0}u / ${o.pallet_count}p</span>
              </div>`).join('')}
            </div>
          </div>
        </div>`;
      }
    } else if (noUnrouted) {
      html += `<div class="empty-state" style="padding:30px;background:var(--gray-50);border-radius:12px">
        <i class="fas fa-check-double" style="font-size:36px;color:#059669"></i>
        <h3 style="margin-top:8px;color:var(--gray-600)">All orders are on routes!</h3>
        <p style="color:var(--gray-400)">No unrouted orders for this date. Got a last-minute order? Add it below.</p>
      </div>`;
    }

    // --- Unassignable warning ---
    if (data.unassignable && data.unassignable.length > 0) {
      html += `<div style="background:#FEE2E2;border-radius:12px;padding:12px;margin:12px 0;border-left:4px solid #DC2626">
        <div style="font-weight:700;color:#991B1B;margin-bottom:4px"><i class="fas fa-exclamation-triangle"></i> Could not assign ${data.unassignable.length} order(s)</div>
        ${data.unassignable.map(o => `<div style="font-size:12px;color:#7F1D1D">${o.order_number} - ${o.business_name}: ${o.reason}</div>`).join('')}
      </div>`;
    }

    // --- LAST-MINUTE ORDER section ---
    html += `<div style="background:linear-gradient(135deg,#EDE9FE,#DDD6FE);border-radius:12px;padding:16px;margin:16px 0;border:2px solid #7C3AED">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;color:#5B21B6;font-size:14px"><i class="fas fa-bolt" style="color:#7C3AED"></i> Last-Minute Order?</div>
          <div style="font-size:12px;color:#6D28D9;margin-top:2px">Create a new order, then hit <strong>Re-Plan</strong> to add it into the best route automatically.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700;white-space:nowrap" onclick="addLastMinuteOrder()">
            <i class="fas fa-plus-circle"></i> New Order
          </button>
          <button class="btn" style="background:linear-gradient(135deg,#2563EB,#1D4ED8);color:white;font-weight:700;white-space:nowrap" onclick="openBulkUploadFromPlanner()">
            <i class="fas fa-file-upload"></i> Bulk Upload
          </button>
        </div>
      </div>
      <div style="font-size:11px;color:#7C3AED;margin-top:6px;padding-top:6px;border-top:1px solid #C4B5FD">
        <i class="fas fa-lightbulb"></i> After adding orders, click <strong>Generate Plan</strong> above to rebuild all routes with your new orders included.
      </div>
    </div>`;

    // --- Confirm button (only if there are new routes to create) ---
    if (hasNewRoutes) {
      html += `<div style="text-align:center;padding:16px;border-top:1px solid var(--gray-200)">
        <button class="btn" style="background:linear-gradient(135deg,#059669,#047857);color:white;font-weight:700;font-size:16px;padding:12px 40px" onclick="confirmAutoPlan()">
          <i class="fas fa-check-double"></i> Confirm & Create ${data.total_new_routes} Route${data.total_new_routes>1?'s':''}
        </button>
        <div style="font-size:11px;color:var(--gray-400);margin-top:8px">This will create routes and mark orders as scheduled for ${data.day_label}</div>
      </div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="scan-result-banner error" style="margin:20px"><i class="fas fa-exclamation-circle"></i> ${err.response?.data?.error || err.message || 'Failed to generate plan'}</div>`;
  }
}

// Show picker to add unrouted orders to an existing route
async function showAddToExistingRoute(routeId, routeNumber, availablePallets) {
  // Fetch unrouted orders
  try {
    const { data: ordersData } = await API.get('/orders?status=new&limit=100');
    const { data: ordersData2 } = await API.get('/orders?status=confirmed&limit=100');
    const allOrders = [...(ordersData.orders||[]), ...(ordersData2.orders||[])];
    // Filter to only orders not on a route (check route_stops is handled server-side, but we filter by status)
    const unrouted = allOrders.filter(o => !['scheduled','in_transit','delivered','completed'].includes(o.status));
    if (unrouted.length === 0) {
      showToast('No unrouted orders available to add.', 'info');
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'modal-overlay';
    panel.style.zIndex = '10001';
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };
    panel.innerHTML = `<div class="modal" style="max-width:550px">
      <div class="modal-header" style="background:linear-gradient(135deg,#EDE9FE,#DDD6FE);border-bottom:2px solid #7C3AED">
        <h3 class="modal-title"><i class="fas fa-plus-circle" style="color:#7C3AED"></i> Add to ${routeNumber}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="max-height:400px;overflow-y:auto;padding:12px">
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:10px"><i class="fas fa-info-circle"></i> Available capacity: <strong>${availablePallets} pallets</strong>. Select orders to add:</div>
        <div id="addToRouteList">
          ${unrouted.map(o => `<label style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;border:1px solid var(--gray-200);margin-bottom:4px;transition:background 0.15s" onmouseover="this.style.background='#F3F4F6'" onmouseout="this.style.background='white'">
            <input type="checkbox" value="${o.id}" class="addToRouteCheck" style="width:16px;height:16px">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px;color:var(--navy)">${o.order_number} — ${o.business_name || o.customer_name || '?'}</div>
              <div style="font-size:11px;color:var(--gray-400)">${o.city||''} ${o.priority!=='normal'?'<span style="color:#D97706;font-weight:600">'+o.priority.toUpperCase()+'</span>':''}</div>
            </div>
          </label>`).join('')}
        </div>
      </div>
      <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:600" onclick="confirmAddToExistingRoute(${routeId}, this)">
          <i class="fas fa-plus"></i> Add & Re-Optimize
        </button>
      </div>
    </div>`;
    document.body.appendChild(panel);
  } catch (err) {
    showToast('Failed to load orders: ' + (err.message || err), 'error');
  }
}

async function confirmAddToExistingRoute(routeId, btn) {
  const checks = document.querySelectorAll('.addToRouteCheck:checked');
  if (checks.length === 0) { showToast('Select at least one order', 'warning'); return; }
  const orderIds = Array.from(checks).map(c => parseInt(c.value));
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
  try {
    const { data } = await API.post(`/routes/${routeId}/add-order-reoptimize`, { order_ids: orderIds });
    showToast(`Added ${data.added} order(s), route re-optimized! (${data.total_stops} stops, ${data.total_miles} mi)`, 'success');
    btn.closest('.modal-overlay')?.remove();
    // Refresh the planner view
    runAutoPlan();
  } catch (err) {
    showToast(err.response?.data?.error || 'Failed to add orders', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus"></i> Add & Re-Optimize';
  }
}

async function reoptimizeExistingRoute(routeId) {
  try {
    showToast('Re-optimizing stop order...', 'info');
    const { data } = await API.post(`/routes/${routeId}/reoptimize`);
    showToast(`Route re-optimized! ${data.stops_reordered} stops reordered (${data.total_miles} mi)`, 'success');
    runAutoPlan();
  } catch (err) {
    showToast(err.response?.data?.error || 'Reoptimize failed', 'error');
  }
}

function addLastMinuteOrder() {
  // Open the order modal. On save, user comes back here and clicks Generate Plan.
  showNewOrderModal();
  showToast('Create your order, then click Generate Plan to include it in routes.', 'info');
}

function openBulkUploadFromPlanner() {
  showBulkUpload();
  showToast('Upload your orders, then return to the planner and click Generate Plan.', 'info');
}

function updateAutoPlanTruck(select) {
  const idx = parseInt(select.dataset.routeIdx);
  const truckId = select.value ? parseInt(select.value) : null;
  if (window._autoPlanData) {
    const route = window._autoPlanData.new_routes.find(r => r.route_index === idx);
    if (route) route.truck_id = truckId;
  }
}

function updateAutoPlanDriver(select) {
  const idx = parseInt(select.dataset.routeIdx);
  const driverId = select.value ? parseInt(select.value) : null;
  if (window._autoPlanData) {
    const route = window._autoPlanData.new_routes.find(r => r.route_index === idx);
    if (route) route.driver_id = driverId;
  }
}

async function confirmAutoPlan() {
  if (!window._autoPlanData) return;
  const plan = window._autoPlanData;
  const newRoutes = plan.new_routes || [];

  if (newRoutes.length === 0) { showToast('No new routes to create', 'warning'); return; }
  if (!confirm(`Create ${newRoutes.length} route${newRoutes.length>1?'s':''} for ${plan.day_label}?`)) return;

  const confirmBtn = document.querySelector('#autoPlanResults button[onclick="confirmAutoPlan()"]');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating routes...'; }

  try {
    const routePayloads = newRoutes.map(r => ({
      date: plan.date,
      truck_id: r.truck_id,
      driver_id: r.driver_id,
      order_ids: r.orders.map(o => o.id),
      notes: r.zone_name ? `Auto-planned: ${r.zone_name} zone` : 'Auto-planned route'
    }));

    const { data } = await API.post('/routes/auto-plan/confirm', { routes: routePayloads });
    showToast(`Created ${data.created_count} route${data.created_count>1?'s':''}! Routes are ready.`, 'success');

    // Refresh to show the newly created routes as existing
    runAutoPlan();
  } catch (err) {
    showToast(err.response?.data?.error || 'Failed to create routes', 'error');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fas fa-check-double"></i> Confirm & Create Routes'; }
  }
}

// ==================== DRIVER VIEW ====================
async function renderDriver() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const driverId = currentUser.role === 'driver' ? currentUser.id : (window._params?.driverId || 4);
  try {
    const { data } = await API.get(`/driver/route?driver_id=${driverId}`);
    if (!data.route) {
      pc.innerHTML = `<div class="empty-state" style="padding:80px 20px">
        <i class="fas fa-coffee" style="font-size:64px;color:var(--gray-300)"></i>
        <h3 style="margin-top:20px">${t('driver_no_route')}</h3>
        <p>${t('driver_no_route_msg')}</p>
        <div style="margin-top:20px;padding:16px;background:white;border-radius:12px;display:inline-block">
          <div style="font-size:13px;color:var(--gray-500)">${t('driver_dist_center')}</div>
          <div style="font-weight:600">100 Aldi Way, Ste 400, West Palm Beach, FL 33411</div>
        </div>
      </div>`;
      return;
    }
    const r = data.route;
    const stops = data.stops;
    const completedStops = stops.filter(s => s.status === 'completed').length;
    const activeStop = stops.find(s => !['completed','failed','skipped'].includes(s.status));
    window._driverStops = stops;
    pc.innerHTML = `
      <!-- Route header card -->
      <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,var(--navy-dark),var(--navy));color:white;border:none">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:13px;opacity:0.7">${t('driver_todays_route')}</div>
              <div style="font-size:22px;font-weight:800">${r.route_number||'Route'}</div>
              <div style="font-size:14px;opacity:0.8;margin-top:4px"><i class="fas fa-truck"></i> ${r.truck_name||'—'} ${r.plate_number?'('+r.plate_number+')':''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:36px;font-weight:800">${completedStops}/${stops.length}</div>
              <div style="font-size:12px;opacity:0.7">${t('driver_stops_complete')}</div>
            </div>
          </div>
          <div class="weight-bar" style="margin-top:12px;background:rgba(255,255,255,0.2)">
            <div class="weight-bar-fill safe" style="width:${stops.length>0?Math.round(completedStops/stops.length*100):0}%;background:var(--green-light)"></div>
          </div>
        </div>
      </div>

      <!-- Route Overview Map (collapsible) -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-body" style="padding:0">
          <button onclick="toggleDriverMap()" style="width:100%;padding:12px 16px;border:none;background:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:600;color:var(--navy)">
            <i class="fas fa-map-marked-alt" style="color:var(--navy-light)"></i> ${t('driver_route_map')}
            <i id="driverMapToggleIcon" class="fas fa-chevron-down" style="margin-left:auto;font-size:12px;transition:transform 0.2s"></i>
          </button>
          <div id="driverMapSection" style="display:none">
            <div style="display:flex;gap:4px;padding:0 12px 8px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm driver-map-layer active" onclick="switchDriverMapLayer('street')" style="font-size:11px;padding:3px 8px"><i class="fas fa-road"></i> Street</button>
              <button class="btn btn-outline btn-sm driver-map-layer" onclick="switchDriverMapLayer('satellite')" style="font-size:11px;padding:3px 8px"><i class="fas fa-satellite"></i> Satellite</button>
              <button class="btn btn-outline btn-sm driver-map-layer" onclick="switchDriverMapLayer('hybrid')" style="font-size:11px;padding:3px 8px"><i class="fas fa-layer-group"></i> Hybrid</button>
            </div>
            <div id="driverRouteMap" style="height:300px;border-radius:0 0 12px 12px"></div>
          </div>
        </div>
      </div>

      <!-- Next stop highlight (if there's an active stop) -->
      ${activeStop ? `
      <div class="card" style="margin-bottom:16px;border:2px solid var(--orange);background:linear-gradient(135deg,#FFF7ED,#FFEDD5)">
        <div class="card-body" style="padding:12px 16px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--orange);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex-shrink:0">${activeStop.sequence}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:600;color:var(--orange);text-transform:uppercase">${t('driver_next_stop')}</div>
              <div style="font-size:16px;font-weight:700">${activeStop.business_name}</div>
              <div style="font-size:12px;color:var(--gray-500)">${activeStop.street||''}, ${activeStop.city||''}</div>
            </div>
            ${activeStop.lat&&activeStop.lng ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${activeStop.lat},${activeStop.lng}&travelmode=driving" target="_blank" class="btn btn-primary" style="flex-shrink:0"><i class="fas fa-directions"></i> ${t('driver_go')}</a>` : ''}
          </div>
        </div>
      </div>` : ''}

      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-weight:700;font-size:16px">${t('driver_delivery_stops')}</h3>
        <span style="font-size:13px;color:var(--gray-500)">${stops.length} ${t('packing_stops')}</span>
      </div>
      ${stops.map((s, i) => {
        const isActive = activeStop && s.id === activeStop.id;
        const isDone = s.status === 'completed';
        return `<div class="driver-stop" style="${isActive?'border-color:var(--orange);border-width:2px':''}">
          <div class="driver-stop-header">
            <div class="stop-number ${isDone?'completed':''} ${isActive?'active':''}">${s.sequence}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="font-size:16px">${s.business_name}</strong>
                ${priorityBadge(s.priority)}
              </div>
              <div style="font-size:13px;color:var(--gray-500);margin-top:2px">${s.order_number}</div>
            </div>
            ${statusBadge(s.status)}
          </div>
          <div class="driver-stop-body">
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
              <i class="fas fa-map-marker-alt" style="color:var(--red);margin-top:2px"></i>
              <div style="flex:1">
                <div>${s.street||'-'}, ${s.city||''} ${s.zip||''}</div>
                ${s.gate_code?`<div style="font-size:12px;color:var(--orange);margin-top:2px"><i class="fas fa-key"></i> ${t('driver_gate_code')}: <strong>${s.gate_code}</strong></div>`:''}
                ${s.driver_notes?`<div style="font-size:12px;color:var(--gray-500);margin-top:2px" data-translate="driver_note" data-original="${escapeHtml(s.driver_notes)}"><i class="fas fa-sticky-note"></i> ${s.driver_notes}</div>`:''}
                ${s.notes?`<div style="font-size:12px;color:var(--navy-light);margin-top:2px;padding:4px 8px;background:#EFF6FF;border-radius:4px"><i class="fas fa-comment" style="color:var(--navy-light)"></i> <em>${escapeHtml(s.notes)}</em></div>`:''}
              </div>
              <!-- Mini satellite preview button -->
              ${s.lat&&s.lng?`<button onclick="showDriverStopMap(${s.id},${s.lat},${s.lng},'${escapeHtml(s.business_name)}')" class="btn btn-outline btn-sm" style="flex-shrink:0;font-size:11px;padding:4px 8px" title="${t('route_view_property')}"><i class="fas fa-satellite"></i></button>`:''}
            </div>
            ${s.customer_phone?`<div style="font-size:13px"><i class="fas fa-phone" style="color:var(--green);margin-right:6px"></i><a href="tel:${s.customer_phone}" style="color:var(--navy-light)">${s.customer_phone}</a> (${s.contact_name||''})</div>`:''}
            ${s.special_instructions?`<div style="margin-top:8px;padding:8px 12px;background:#FFF7ED;border-radius:6px;font-size:13px;border-left:3px solid var(--orange)" data-translate="special_instr" data-original="${escapeHtml(s.special_instructions)}"><i class="fas fa-exclamation-circle" style="color:var(--orange)"></i> ${s.special_instructions}</div>`:''}
            <!-- Mini satellite map (hidden by default) -->
            <div id="driver-stop-map-${s.id}" style="display:none;margin-top:8px;height:200px;border-radius:8px;overflow:hidden;border:2px solid var(--gray-200)"></div>
            ${s.items && s.items.length > 0 ? `
            <div style="margin-top:10px">
              <button onclick="toggleDriverPacking(${s.id})" class="btn btn-outline btn-sm" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;padding:6px 10px;border-color:var(--gray-200);color:var(--gray-600)">
                <i class="fas fa-boxes"></i> ${t('driver_packing_list')} (${s.items.length} ${s.items.length>1?t('driver_items'):t('driver_item')}) <i id="driver-packing-icon-${s.id}" class="fas fa-chevron-down" style="font-size:10px;transition:transform 0.2s"></i>
              </button>
              <div id="driver-packing-${s.id}" style="display:none;margin-top:8px;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden">
                <table style="width:100%;font-size:12px;border-collapse:collapse">
                  <thead><tr style="background:var(--gray-50)">
                    <th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--gray-600)">${t('order_product')}</th>
                    <th style="padding:6px 10px;text-align:center;font-weight:600;color:var(--gray-600)">${t('order_quantity')}</th>
                    <th style="padding:6px 10px;text-align:right;font-weight:600;color:var(--gray-600)">Unit</th>
                  </tr></thead>
                  <tbody>
                    ${s.items.map(item => `<tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:6px 10px">
                        <div style="font-weight:600">${escapeHtml(item.product_name)}</div>
                        ${item.sku ? `<div style="font-size:11px;color:var(--gray-400)">SKU: ${escapeHtml(item.sku)}</div>` : ''}
                      </td>
                      <td style="padding:6px 10px;text-align:center;font-weight:600">${item.quantity} ${item.unit_type||'ea'}</td>
                      <td style="padding:6px 10px;text-align:right;color:var(--gray-500)">${item.unit_type||'ea'}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>` : `<div style="margin-top:6px;font-size:12px;color:var(--gray-400)"><i class="fas fa-info-circle"></i> ${t('driver_no_items')}</div>`}
          </div>
          ${!isDone ? `<div class="driver-stop-actions">
            ${s.lat&&s.lng?`<a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving" target="_blank" class="btn btn-primary btn-sm"><i class="fas fa-directions"></i> ${t('driver_navigate')}</a>`
            :`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((s.street||'')+', '+(s.city||'')+' FL')}" target="_blank" class="btn btn-primary btn-sm"><i class="fas fa-directions"></i> ${t('driver_navigate')}</a>`}
            ${s.lat&&s.lng?`<button class="btn btn-outline btn-sm" style="flex:0" onclick="showStopStreetView(${s.lat},${s.lng},'${escapeHtml(s.business_name)}')" title="${t('street_view')}"><i class="fas fa-street-view" style="color:var(--green)"></i></button>`:''}
            ${s.status==='pending'?`<button class="btn btn-warning btn-sm" onclick="updateStopStatus(${s.id},'arrived')"><i class="fas fa-map-pin"></i> ${t('driver_arrived')}</button>`:''}
            ${s.status==='arrived'?`<button class="btn btn-success btn-sm" onclick="showDeliveryProofModal(${s.id}, ${s.order_id}, '${escapeHtml(s.business_name)}', '${s.order_number}', ${s.lat||'null'}, ${s.lng||'null'})"><i class="fas fa-camera"></i> ${t('driver_complete_photo')}</button>`:''}
            ${['pending','arrived'].includes(s.status)?`<button class="btn btn-outline btn-sm" onclick="updateStopStatus(${s.id},'failed')" style="flex:0"><i class="fas fa-exclamation-triangle"></i></button>`:''}
            <button class="btn btn-outline btn-sm" style="flex:0;color:#7C3AED;border-color:#7C3AED" onclick="showDriverReturnModal(${s.order_id}, ${r.id}, ${s.customer_id})" title="Log Return"><i class="fas fa-rotate-left"></i></button>
          </div>` : `<div style="padding:8px 16px;background:#ECFDF5;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--green);font-weight:600">
            <i class="fas fa-check-circle"></i> ${t('driver_delivered')} ${s.completed_at?t('driver_at')+' '+s.completed_at.split('T')[1]?.slice(0,5)||'':''}
            <button class="btn btn-outline btn-sm" style="margin-left:8px;font-size:11px;padding:3px 8px;color:#7C3AED;border-color:#7C3AED" onclick="showDriverReturnModal(${s.order_id}, ${r.id}, ${s.customer_id})"><i class="fas fa-rotate-left"></i> Return</button>
            <button class="btn btn-outline btn-sm" style="margin-left:auto;font-size:11px;padding:3px 8px" onclick="viewDeliveryProof(${s.order_id})"><i class="fas fa-image"></i> ${t('driver_view_proof')}</button>
          </div>`}
        </div>`;
      }).join('')}
      ${completedStops === stops.length && stops.length > 0 ? `
      <div style="text-align:center;padding:32px;background:white;border-radius:12px;border:2px solid var(--green)">
        <i class="fas fa-flag-checkered" style="font-size:48px;color:var(--green)"></i>
        <h3 style="margin-top:12px;color:var(--green)">${t('driver_all_complete')}</h3>
        <p style="color:var(--gray-500)">${t('driver_great_job')}</p>
        <a href="https://www.google.com/maps/dir/?api=1&destination=100+Aldi+Way+Royal+Palm+Beach+FL" target="_blank" class="btn btn-success" style="margin-top:12px"><i class="fas fa-home"></i> ${t('driver_navigate_base')}</a>
      </div>` : ''}`;
    // Auto-translate instructions if not English
    translateDriverInstructions();
  } catch (err) { pc.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${t('driver_error')}</h3><p>${err.message}</p></div>`; }
}

async function updateStopStatus(stopId, status) {
  try {
    await API.patch(`/route-stops/${stopId}/status`, { status });
    showToast(status === 'completed' ? t('driver_delivery_completed') : status === 'arrived' ? t('driver_arrived_stop') : t('driver_status_updated'));
    renderDriver();
  } catch (err) { showToast(t('driver_update_failed'), 'error'); }
}

function toggleDriverPacking(stopId) {
  const el = document.getElementById('driver-packing-' + stopId);
  const icon = document.getElementById('driver-packing-icon-' + stopId);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ==================== DRIVER MAP FUNCTIONS ====================
function toggleDriverMap() {
  const section = document.getElementById('driverMapSection');
  const icon = document.getElementById('driverMapToggleIcon');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    if (icon) icon.style.transform = 'rotate(180deg)';
    if (!window._driverMapInit) { initDriverMap(); window._driverMapInit = true; }
  } else {
    section.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(0deg)';
  }
}

function initDriverMap() {
  const stops = window._driverStops || [];
  if (!window.__gmapsLoaded) return;
  const depot = window.__DEPOT || DEPOT;
  const container = document.getElementById('driverRouteMap');
  if (!container) return;
  const map = new google.maps.Map(container, { center: { lat: depot.lat, lng: depot.lng }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
  window._driverMap = map;

  // Depot marker
  new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: '#1E3A8A', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });

  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: depot.lat, lng: depot.lng });
  const coords = [{ lat: depot.lat, lng: depot.lng }];
  stops.forEach(s => {
    if (!s.lat || !s.lng) return;
    bounds.extend({ lat: s.lat, lng: s.lng });
    coords.push({ lat: s.lat, lng: s.lng });
    const done = s.status === 'completed';
    const color = done ? '#059669' : s.status === 'arrived' ? '#2563EB' : '#F97316';
    const marker = new google.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }, label: { text: String(s.sequence), color: '#FFFFFF', fontWeight: '700', fontSize: '11px' }, zIndex: 100 });
    const iw = new google.maps.InfoWindow({ content: `<strong>#${s.sequence} ${escapeHtml(s.business_name)}</strong><br>${s.street||''}<br>${statusBadge(s.status)}` });
    marker.addListener('click', () => iw.open(map, marker));
  });
  coords.push({ lat: depot.lat, lng: depot.lng });

  // Draw route with Directions API for real road path
  if (coords.length > 2) {
    const waypoints = coords.slice(1, -1).map(c => `${c.lat},${c.lng}`);
    API.post('/maps/directions', { origin: `${depot.lat},${depot.lng}`, destination: `${depot.lat},${depot.lng}`, waypoints })
      .then(({ data: dirData }) => {
        if (dirData.status === 'OK' && dirData.overview_polyline) {
          const path = google.maps.geometry.encoding.decodePath(dirData.overview_polyline);
          new google.maps.Polyline({ path, geodesic: true, strokeColor: '#4285F4', strokeOpacity: 0.9, strokeWeight: 5, map });
        } else {
          new google.maps.Polyline({ path: coords, geodesic: true, strokeColor: '#2563EB', strokeOpacity: 0.7, strokeWeight: 3, map });
        }
      })
      .catch(() => {
        new google.maps.Polyline({ path: coords, geodesic: true, strokeColor: '#2563EB', strokeOpacity: 0.7, strokeWeight: 3, map });
      });
  }
  map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
}

function switchDriverMapLayer(type) {
  if (!window._driverMap) return;
  document.querySelectorAll('.driver-map-layer').forEach(b => b.classList.remove('active'));
  if (type === 'satellite') { window._driverMap.setMapTypeId(google.maps.MapTypeId.SATELLITE); }
  else if (type === 'hybrid') { window._driverMap.setMapTypeId(google.maps.MapTypeId.HYBRID); }
  else { window._driverMap.setMapTypeId(google.maps.MapTypeId.ROADMAP); }
  event?.target?.closest('.driver-map-layer')?.classList.add('active');
}

// Show satellite mini-map for individual stop in driver view
function showDriverStopMap(stopId, lat, lng, name) {
  const container = document.getElementById(`driver-stop-map-${stopId}`);
  if (!container) return;
  if (container.style.display === 'block') { container.style.display = 'none'; return; }
  container.style.display = 'block';
  if (!window.__gmapsLoaded) return;
  if (!window._driverStopMaps) window._driverStopMaps = {};
  container.innerHTML = '';
  const map = new google.maps.Map(container, { center: { lat, lng }, zoom: 18, mapTypeId: google.maps.MapTypeId.HYBRID, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: false });
  window._driverStopMaps[stopId] = map;
  const marker = new google.maps.Marker({ position: { lat, lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#F97316', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: name, zIndex: 100 });
  const iw = new google.maps.InfoWindow({ content: `<strong>${escapeHtml(name)}</strong>` });
  iw.open(map, marker);
}

// ==================== DELIVERY PROOF MODAL ====================
function showDeliveryProofModal(stopId, orderId, businessName, orderNumber, lat, lng) {
  // Try to get GPS immediately
  let gpsLat = lat, gpsLng = lng;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => { gpsLat = pos.coords.latitude; gpsLng = pos.coords.longitude; },
      () => {}, { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:520px">
    <div class="modal-header" style="background:linear-gradient(135deg,#ECFDF5,#D1FAE5)">
      <h3 class="modal-title"><i class="fas fa-camera" style="color:var(--green);margin-right:8px"></i>${t('proof_title')}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px;padding:12px;background:var(--gray-50);border-radius:10px;display:flex;align-items:center;gap:12px">
        <div class="stop-number" style="width:36px;height:36px;font-size:14px;flex-shrink:0"><i class="fas fa-box"></i></div>
        <div>
          <div style="font-weight:700;font-size:15px">${orderNumber}</div>
          <div style="font-size:13px;color:var(--gray-500)">${businessName}</div>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <label class="form-label" style="display:flex;align-items:center;gap:6px">
          <i class="fas fa-camera" style="color:var(--orange)"></i>
          ${t('proof_take_photo')} <span style="color:var(--red)">*</span>
          <span style="font-size:11px;color:var(--gray-400);font-weight:400">(Required)</span>
        </label>
        <div class="proof-upload-area" id="proofUploadArea">
          <div id="proofPlaceholder">
            <div style="font-size:36px;color:var(--gray-300);margin-bottom:8px"><i class="fas fa-camera-retro"></i></div>
            <div style="font-size:14px;font-weight:600;color:var(--gray-600)">Take a photo of the delivered goods</div>
            <div style="font-size:12px;color:var(--gray-400);margin-top:4px">Photo at delivery location with visible feed bags</div>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
              <button class="btn btn-primary btn-sm" onclick="captureProofPhoto()"><i class="fas fa-camera"></i> ${t('proof_take_photo')}</button>
              <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden"><i class="fas fa-upload"></i> ${t('proof_upload_photo')}<input type="file" accept="*/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="handleProofPhoto(event)"></label>
            </div>
          </div>
          <div id="proofPreviewContainer" style="display:none">
            <img id="proofPreviewImg" style="max-height:200px;max-width:100%;border-radius:8px;object-fit:contain;display:block;margin:0 auto" alt="Proof photo">
            <div style="display:flex;gap:8px;justify-content:center;margin-top:10px" onclick="event.stopPropagation()">
              <span class="badge badge-confirmed"><i class="fas fa-check"></i> Photo captured</span>
              <button class="btn btn-outline btn-sm" onclick="clearProofPhoto()"><i class="fas fa-redo"></i> Retake</button>
            </div>
          </div>
        </div>

      </div>

      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label"><i class="fas fa-sticky-note" style="color:var(--gray-400);margin-right:4px"></i>${t('proof_notes')} <span style="font-size:11px;color:var(--gray-400);font-weight:400">(Optional)</span></label>
        <textarea class="form-textarea" id="proofNotes" rows="2" placeholder="e.g. Left at barn door, signed by ranch hand, customer not home..."></textarea>
      </div>

      <div style="font-size:12px;color:var(--gray-400);display:flex;align-items:center;gap:6px;padding:8px 0">
        <i class="fas fa-map-pin"></i>
        <span id="proofGpsStatus">GPS: ${lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'Acquiring location...'}</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-success" id="submitProofBtn" onclick="submitDeliveryProof(${stopId}, ${orderId}, ${lat||'null'}, ${lng||'null'})">
        <i class="fas fa-check-circle"></i> ${t('proof_submit')}
      </button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  window._proofPhotoData = null;
}

function triggerProofUpload(event) {
  if (event.target.closest('button') || event.target.closest('label')) return;
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = '*/*';
  tempInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  tempInput.onchange = function(e) { handleProofPhoto(e); tempInput.remove(); };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function captureProofPhoto() {
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = 'image/*';
  tempInput.capture = 'environment';
  tempInput.style.display = 'none';
  tempInput.onchange = function(e) { handleProofPhoto(e); tempInput.remove(); };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function handleProofPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    window._proofPhotoData = e.target.result;
    document.getElementById('proofPlaceholder').style.display = 'none';
    document.getElementById('proofPreviewContainer').style.display = 'block';
    document.getElementById('proofPreviewImg').src = e.target.result;
    document.getElementById('proofUploadArea').classList.add('has-photo');
  };
  reader.readAsDataURL(file);
}

function clearProofPhoto() {
  window._proofPhotoData = null;

  document.getElementById('proofPlaceholder').style.display = 'block';
  document.getElementById('proofPreviewContainer').style.display = 'none';
  document.getElementById('proofUploadArea').classList.remove('has-photo');
}

async function submitDeliveryProof(stopId, orderId, fallbackLat, fallbackLng) {
  if (!window._proofPhotoData) {
    showToast(t('proof_photo_required'), 'warning');
    return;
  }
  const submitBtn = document.getElementById('submitProofBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

  // Try to get fresh GPS
  let gpsLat = fallbackLat, gpsLng = fallbackLng;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 3000 });
    });
    gpsLat = pos.coords.latitude;
    gpsLng = pos.coords.longitude;
  } catch (e) { /* use fallback */ }

  try {
    await API.patch(`/route-stops/${stopId}/status`, {
      status: 'completed',
      photo: window._proofPhotoData,
      gps_lat: gpsLat,
      gps_lng: gpsLng,
      notes: document.getElementById('proofNotes').value || null,
    });
    document.querySelector('.modal-overlay').remove();
    window._proofPhotoData = null;
    showToast(t('proof_success'), 'success');
    renderDriver();
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> ${t('proof_submit')}`;
    showToast(err.response?.data?.error || t('proof_fail'), 'error');
  }
}

async function viewDeliveryProof(orderId) {
  try {
    const { data } = await API.get(`/delivery-proof/${orderId}`);
    const p = data.proof;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const isBase64 = p.photo_url && p.photo_url.startsWith('data:');
    modal.innerHTML = `<div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fas fa-image" style="color:var(--green);margin-right:8px"></i>Delivery Proof</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="text-align:center">
        ${p.photo_url ? `<img src="${isBase64 ? p.photo_url : ''}" alt="Delivery proof" style="max-width:100%;max-height:400px;border-radius:10px;border:1px solid var(--gray-200);${isBase64 ? '' : 'display:none'}">
          ${!isBase64 ? `<div style="padding:20px;background:var(--gray-50);border-radius:10px"><i class="fas fa-image" style="font-size:48px;color:var(--gray-300)"></i><div style="margin-top:8px;font-size:13px;color:var(--gray-500)">Photo stored externally</div></div>` : ''}` 
          : '<div style="padding:20px;background:var(--gray-50);border-radius:10px"><i class="fas fa-image" style="font-size:48px;color:var(--gray-300)"></i><div style="margin-top:8px;font-size:13px;color:var(--gray-500)">No photo available</div></div>'}
        <div style="margin-top:16px;text-align:left;display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="padding:10px;background:var(--gray-50);border-radius:8px">
            <div class="form-label" style="margin-bottom:2px"><i class="fas fa-map-pin" style="color:var(--navy-light)"></i> GPS Location</div>
            <div style="font-size:13px">${p.gps_lat && p.gps_lng ? `${Number(p.gps_lat).toFixed(5)}, ${Number(p.gps_lng).toFixed(5)}` : 'Not recorded'}</div>
          </div>
          <div style="padding:10px;background:var(--gray-50);border-radius:8px">
            <div class="form-label" style="margin-bottom:2px"><i class="fas fa-clock" style="color:var(--orange)"></i> Timestamp</div>
            <div style="font-size:13px">${p.created_at ? dayjs(p.created_at).format('MMM D, YYYY h:mm A') : 'N/A'}</div>
          </div>
        </div>
        ${p.notes ? `<div style="margin-top:12px;text-align:left;padding:10px 12px;background:#FFF7ED;border-radius:8px;border-left:3px solid var(--orange)">
          <div class="form-label" style="margin-bottom:2px"><i class="fas fa-sticky-note" style="color:var(--orange)"></i> Driver Notes</div>
          <div style="font-size:13px">${p.notes}</div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch (err) {
    showToast('No delivery proof found for this order', 'info');
  }
}

// ==================== EDIT CUSTOMER / ADDRESS MODALS ====================
async function showEditCustomerModal(custId, orderId) {
  const [custRes, truckRes] = await Promise.all([API.get(`/customers/${custId}`), API.get('/trucks')]);
  const c = custRes.data.customer;
  const trucks = truckRes.data.trucks || [];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-user-edit" style="color:var(--navy-light);margin-right:8px"></i>Edit Customer</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Business/Farm Name *</label><input class="form-input" id="editCustName" value="${c.business_name||''}"></div>
        <div class="form-group"><label class="form-label">Contact Name</label><input class="form-input" id="editCustContact" value="${c.contact_name||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="editCustPhone" value="${c.phone||''}"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="editCustEmail" value="${c.email||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Type</label>
          <select class="form-select" id="editCustType">
            ${['farm','ranch','equestrian','retail','other'].map(t => `<option value="${t}" ${c.customer_type===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:4px"></i> Required Truck</label>
          <select class="form-select" id="editCustTruck">
            <option value="">No specific truck</option>
            ${trucks.map(tk => `<option value="${tk.id}" ${c.preferred_truck_id==tk.id?'selected':''}>${tk.name} (${tk.max_pallet_spots||12} pallets)</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="editCustNotes" value="${c.notes||''}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditCustomer(${custId}, ${orderId})"><i class="fas fa-save"></i> Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitEditCustomer(custId, orderId) {
  try {
    const truckVal = document.getElementById('editCustTruck')?.value;
    await API.put(`/customers/${custId}`, {
      business_name: document.getElementById('editCustName').value.trim(),
      contact_name: document.getElementById('editCustContact').value.trim() || null,
      phone: document.getElementById('editCustPhone').value.trim() || null,
      email: document.getElementById('editCustEmail').value.trim() || null,
      customer_type: document.getElementById('editCustType').value,
      notes: document.getElementById('editCustNotes').value.trim() || null,
      preferred_truck_id: truckVal ? parseInt(truckVal) : null,
    });
    document.querySelector('.modal-overlay').remove();
    showToast('Customer updated!', 'success');
    if (orderId) renderOrderDetail(orderId);
    else renderCustomerDetail(custId);
  } catch (err) { showToast('Failed to update customer', 'error'); }
}

async function showEditAddressModal(addrId, orderId, customerId) {
  const [addrRes, driversRes] = await Promise.all([
    API.get(`/addresses/${addrId}`),
    API.get('/drivers')
  ]);
  const a = addrRes.data.address;
  const drivers = driversRes.data.drivers || [];
  const restrictions = a.driver_restrictions ? JSON.parse(a.driver_restrictions) : {};
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:600px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-map-marker-alt" style="color:var(--orange);margin-right:8px"></i>Edit Delivery Address</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="editAddrLabel" value="${a.label||'Primary'}" placeholder="e.g. Main Barn, Front Gate"></div>
        <div class="form-group" style="flex:2"><label class="form-label">Street *</label><input class="form-input" id="editAddrStreet" value="${a.street||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">City *</label><input class="form-input" id="editAddrCity" value="${a.city||''}"></div>
        <div class="form-group" style="flex:0.5"><label class="form-label">State</label><input class="form-input" id="editAddrState" value="${a.state||'FL'}"></div>
        <div class="form-group"><label class="form-label">Zip</label><input class="form-input" id="editAddrZip" value="${a.zip||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label"><i class="fas fa-key" style="color:var(--orange);margin-right:4px"></i>Gate Code</label><input class="form-input" id="editAddrGate" value="${a.gate_code||''}" placeholder="e.g. #1234"></div>
        <div class="form-group" style="flex:2"><label class="form-label"><i class="fas fa-sticky-note" style="color:var(--gray-400);margin-right:4px"></i>Driver Notes</label><input class="form-input" id="editAddrNotes" value="${a.driver_notes||''}" placeholder="e.g. Use side entrance, big dog in yard..."></div>
      </div>
      <div style="padding:12px;background:linear-gradient(135deg,#EFF6FF,#F0F9FF);border:1px solid #BFDBFE;border-radius:10px;margin-top:12px">
        <div style="font-weight:700;font-size:13px;color:var(--navy);margin-bottom:10px"><i class="fas fa-truck" style="margin-right:6px;color:var(--navy-light)"></i>Delivery Requirements</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Truck Size Required</label>
            <select class="form-select" id="editAddrTruckReq">
              <option value="" ${!a.truck_requirement?'selected':''}>Any Truck</option>
              <option value="big" ${a.truck_requirement==='big'?'selected':''}>Big Truck Only</option>
              <option value="small" ${a.truck_requirement==='small'?'selected':''}>Small Truck Only</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:8px">
          <label class="form-label">Driver Restrictions</label>
          <div style="max-height:120px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:8px;background:white">
            ${drivers.map(d => {
              const status = restrictions[d.id] || '';
              return `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--gray-100)">
                <span style="flex:1;font-size:13px">${d.name}</span>
                <select class="form-select driver-restriction-sel" data-driver-id="${d.id}" style="width:140px;padding:4px 8px;font-size:11px">
                  <option value="" ${!status?'selected':''}>No Restriction</option>
                  <option value="preferred" ${status==='preferred'?'selected':''}>Preferred</option>
                  <option value="blocked" ${status==='blocked'?'selected':''}>Cannot Deliver</option>
                </select>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div style="padding:12px;background:linear-gradient(135deg,#F0FDF4,#ECFDF5);border:1px solid #BBF7D0;border-radius:10px;margin-top:12px">
        <div style="font-weight:700;font-size:13px;color:var(--navy);margin-bottom:10px"><i class="fas fa-map-pin" style="margin-right:6px;color:#16A34A"></i>GPS Coordinates</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Latitude</label><input class="form-input" id="editAddrLat" type="number" step="any" value="${a.lat||''}" placeholder="e.g. 26.6168"></div>
          <div class="form-group"><label class="form-label">Longitude</label><input class="form-input" id="editAddrLng" type="number" step="any" value="${a.lng||''}" placeholder="e.g. -80.2926"></div>
          <div class="form-group" style="flex:0;align-self:flex-end;display:flex;gap:4px">
            <button type="button" class="btn btn-outline" style="white-space:nowrap;font-size:11px;padding:8px 12px" onclick="document.getElementById('editAddrLat').value='';document.getElementById('editAddrLng').value=''"><i class="fas fa-eraser"></i> Clear</button>
            <button type="button" class="btn btn-outline" style="white-space:nowrap;font-size:11px;padding:8px 12px;color:#2563EB;border-color:#2563EB" onclick="openPinPickerInEditModal()"><i class="fas fa-map-pin"></i> Pick on Map</button>
          </div>
        </div>
        <div id="editAddrPinMap" style="display:none;height:250px;border-radius:8px;margin-top:8px;border:2px solid #BFDBFE"></div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:6px">
          <i class="fas fa-info-circle"></i> Enter coordinates manually, click 'Pick on Map' to place a pin, or leave blank to auto-geocode on save.
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditAddress(${addrId}, ${orderId || 'null'}, ${customerId || 'null'})"><i class="fas fa-save"></i> Save Address</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

// Open an inline pin-picker map inside the edit address modal
function openPinPickerInEditModal() {
  const container = document.getElementById('editAddrPinMap');
  if (!container) return;
  if (container.style.display !== 'none') { container.style.display = 'none'; window._editAddrPinMap = null; return; }
  if (!window.__gmapsLoaded) return;
  container.style.display = 'block';
  container.innerHTML = '';
  const existLat = parseFloat(document.getElementById('editAddrLat')?.value) || 26.68;
  const existLng = parseFloat(document.getElementById('editAddrLng')?.value) || -80.26;
  const startZoom = (document.getElementById('editAddrLat')?.value) ? 15 : 12;
  setTimeout(() => {
    const map = new google.maps.Map(container, { center: { lat: existLat, lng: existLng }, zoom: startZoom, mapTypeControl: true, streetViewControl: false, fullscreenControl: false });
    window._editAddrPinMap = map;
    let marker = null;
    if (document.getElementById('editAddrLat')?.value && document.getElementById('editAddrLng')?.value) {
      marker = new google.maps.Marker({ position: { lat: existLat, lng: existLng }, map, draggable: true });
      marker.addListener('dragend', function() { const p = marker.getPosition(); document.getElementById('editAddrLat').value = Math.round(p.lat()*1000000)/1000000; document.getElementById('editAddrLng').value = Math.round(p.lng()*1000000)/1000000; });
    }
    map.addListener('click', function(e) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (marker) { marker.setPosition(e.latLng); }
      else { marker = new google.maps.Marker({ position: e.latLng, map, draggable: true }); marker.addListener('dragend', function() { const p = marker.getPosition(); document.getElementById('editAddrLat').value = Math.round(p.lat()*1000000)/1000000; document.getElementById('editAddrLng').value = Math.round(p.lng()*1000000)/1000000; }); }
      document.getElementById('editAddrLat').value = Math.round(lat*1000000)/1000000;
      document.getElementById('editAddrLng').value = Math.round(lng*1000000)/1000000;
    });
  }, 100);
}

async function submitEditAddress(addrId, orderId, customerId) {
  const street = document.getElementById('editAddrStreet').value.trim();
  const city = document.getElementById('editAddrCity').value.trim();
  if (!street || !city) { showToast('Street and City are required', 'warning'); return; }
  // Collect driver restrictions
  const driverRestrictions = {};
  document.querySelectorAll('.driver-restriction-sel').forEach(sel => {
    const driverId = sel.dataset.driverId;
    const val = sel.value;
    if (val) driverRestrictions[driverId] = val;
  });
  try {
    const manualLat = document.getElementById('editAddrLat')?.value?.trim();
    const manualLng = document.getElementById('editAddrLng')?.value?.trim();
    const payload = {
      label: document.getElementById('editAddrLabel').value.trim(),
      street: street,
      city: city,
      state: document.getElementById('editAddrState').value.trim() || 'FL',
      zip: document.getElementById('editAddrZip').value.trim() || null,
      gate_code: document.getElementById('editAddrGate').value.trim() || null,
      driver_notes: document.getElementById('editAddrNotes').value.trim() || null,
      truck_requirement: document.getElementById('editAddrTruckReq')?.value || null,
      driver_restrictions: Object.keys(driverRestrictions).length > 0 ? JSON.stringify(driverRestrictions) : null,
    };
    if (manualLat && manualLng) {
      payload.lat = parseFloat(manualLat);
      payload.lng = parseFloat(manualLng);
    }
    const { data } = await API.put(`/addresses/${addrId}`, payload);
    document.querySelector('.modal-overlay')?.remove();
    const geoMsg = data.geocoded ? ' (coordinates updated)' : '';
    showToast('Address updated!' + geoMsg, 'success');
    if (orderId) renderOrderDetail(orderId);
    else if (customerId) renderCustomerDetail(customerId);
  } catch (err) { showToast('Failed to update address', 'error'); }
}

async function deleteAddress(addrId, customerId) {
  if (!confirm('Delete this address? This cannot be undone.')) return;
  try {
    await API.delete(`/addresses/${addrId}`);
    showToast('Address deleted', 'success');
    renderCustomerDetail(customerId);
  } catch (err) {
    showToast(err.response?.data?.error || 'Failed to delete address', 'error');
  }
}

// Retry geocoding for an address
async function retryGeocode(addrId, orderId) {
  try {
    showToast('Looking up address...', 'info');
    const { data } = await API.post(`/addresses/${addrId}/geocode`);
    if (data.success) {
      showToast(`Coordinates found via ${data.source || 'geocoder'}!`, 'success');
      if (orderId) renderOrderDetail(orderId);
    } else {
      showToast('Could not find coordinates. Try placing the pin manually on the map.', 'warning');
    }
  } catch (err) { showToast('Geocoding failed', 'error'); }
}

// Pin-drop modal: let user place a pin on a map to set GPS coordinates
function showPinDropModal(addrId, orderId, customerId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  // Default center: South Florida / Loxahatchee area
  const defaultLat = 26.68, defaultLng = -80.26;
  modal.innerHTML = `<div class="modal" style="max-width:700px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-map-pin" style="color:#DC2626;margin-right:8px"></i>Place Delivery Pin</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body" style="padding:0">
      <div style="padding:12px 16px;background:#FFF7ED;border-bottom:1px solid #FED7AA;font-size:13px;color:#92400E">
        <i class="fas fa-hand-pointer" style="margin-right:6px"></i><strong>Click on the map</strong> to place the delivery pin. Drag the pin to adjust. Then click <strong>Save Pin Location</strong>.
      </div>
      <div id="pinDropMap" style="height:400px;width:100%"></div>
      <div id="pinDropCoords" style="padding:10px 16px;font-size:12px;color:var(--gray-500);text-align:center">No pin placed yet — click on the map</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-success" id="pinDropSaveBtn" disabled onclick="savePinDrop(${addrId},${orderId||'null'},${customerId||'null'})"><i class="fas fa-save"></i> Save Pin Location</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  // Initialize Google Map after DOM insert
  if (!window.__gmapsLoaded) return;
  setTimeout(() => {
    const depot = window.__DEPOT || DEPOT;
    const map = new google.maps.Map(document.getElementById('pinDropMap'), { center: { lat: defaultLat, lng: defaultLng }, zoom: 12, mapTypeControl: true, streetViewControl: false, fullscreenControl: false });
    // Depot marker
    new google.maps.Marker({ position: { lat: depot.lat, lng: depot.lng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#1E3A5F', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }, title: 'BF Distribution Center', zIndex: 1000 });
    let marker = null;
    window._pinDropData = { lat: null, lng: null };
    map.addListener('click', function(e) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (marker) { marker.setPosition(e.latLng); }
      else { marker = new google.maps.Marker({ position: e.latLng, map, draggable: true }); marker.addListener('dragend', function() { const p = marker.getPosition(); updatePinCoords(p.lat(), p.lng()); }); }
      updatePinCoords(lat, lng);
    });
    function updatePinCoords(lat, lng) {
      window._pinDropData = { lat: Math.round(lat*1000000)/1000000, lng: Math.round(lng*1000000)/1000000 };
      document.getElementById('pinDropCoords').innerHTML = `<i class="fas fa-check-circle" style="color:var(--green);margin-right:4px"></i>Pin: <strong>${window._pinDropData.lat}, ${window._pinDropData.lng}</strong>`;
      document.getElementById('pinDropSaveBtn').disabled = false;
    }
  }, 200);
}

async function savePinDrop(addrId, orderId, customerId) {
  if (!window._pinDropData?.lat) { showToast('Click the map to place a pin first', 'warning'); return; }
  try {
    await API.put(`/addresses/${addrId}/coordinates`, { lat: window._pinDropData.lat, lng: window._pinDropData.lng });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Pin location saved!', 'success');
    if (orderId) renderOrderDetail(orderId);
    else if (customerId) renderCustomerDetail(customerId);
  } catch (err) {
    showToast(err.response?.data?.error || 'Failed to save coordinates', 'error');
  }
}

async function showNewAddressForCustomer(custId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-plus-circle" style="color:var(--green);margin-right:8px"></i>Add Delivery Address</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="newCustAddrLabel" value="Primary" placeholder="e.g. Main Barn, Front Gate"></div>
        <div class="form-group" style="flex:2"><label class="form-label">Street *</label><input class="form-input" id="newCustAddrStreet" placeholder="e.g. 1234 Farm Road"></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">City *</label><input class="form-input" id="newCustAddrCity" value="Loxahatchee Groves"></div>
        <div class="form-group" style="flex:0.5"><label class="form-label">State</label><input class="form-input" id="newCustAddrState" value="FL"></div>
        <div class="form-group"><label class="form-label">Zip</label><input class="form-input" id="newCustAddrZip" placeholder="33470"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label"><i class="fas fa-key" style="color:var(--orange);margin-right:4px"></i>Gate Code</label><input class="form-input" id="newCustAddrGate" placeholder="e.g. #1234"></div>
        <div class="form-group" style="flex:2"><label class="form-label"><i class="fas fa-sticky-note" style="color:var(--gray-400);margin-right:4px"></i>Driver Notes</label><input class="form-input" id="newCustAddrNotes" placeholder="e.g. Use side entrance, big dog..."></div>
      </div>
      <div style="padding:12px;background:linear-gradient(135deg,#F0FDF4,#ECFDF5);border:1px solid #BBF7D0;border-radius:10px;margin-top:12px">
        <div style="font-weight:700;font-size:13px;color:var(--navy);margin-bottom:10px"><i class="fas fa-map-pin" style="margin-right:6px;color:#16A34A"></i>GPS Coordinates <span style="font-weight:400;font-size:11px;color:var(--gray-400)">(optional)</span></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Latitude</label><input class="form-input" id="newCustAddrLat" type="number" step="any" placeholder="e.g. 26.6168"></div>
          <div class="form-group"><label class="form-label">Longitude</label><input class="form-input" id="newCustAddrLng" type="number" step="any" placeholder="e.g. -80.2926"></div>
        </div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:6px">
          <i class="fas fa-info-circle"></i> Enter coordinates manually, or leave blank to auto-geocode from address.
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewAddressForCustomer(${custId})"><i class="fas fa-save"></i> Add Address</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewAddressForCustomer(custId) {
  const street = document.getElementById('newCustAddrStreet').value.trim();
  const city = document.getElementById('newCustAddrCity').value.trim();
  if (!street || !city) { showToast('Street and City are required', 'warning'); return; }
  try {
    const custLatVal = document.getElementById('newCustAddrLat')?.value?.trim();
    const custLngVal = document.getElementById('newCustAddrLng')?.value?.trim();
    const custPayload = {
      customer_id: custId,
      label: document.getElementById('newCustAddrLabel').value.trim() || 'Primary',
      street: street,
      city: city,
      state: document.getElementById('newCustAddrState').value.trim() || 'FL',
      zip: document.getElementById('newCustAddrZip').value.trim() || null,
      gate_code: document.getElementById('newCustAddrGate').value.trim() || null,
      driver_notes: document.getElementById('newCustAddrNotes').value.trim() || null,
      is_primary: 0,
    };
    if (custLatVal && custLngVal) {
      custPayload.lat = parseFloat(custLatVal);
      custPayload.lng = parseFloat(custLngVal);
    }
    const { data } = await API.post('/addresses', custPayload);
    document.querySelector('.modal-overlay')?.remove();
    const geoMsg = data.geocoded ? ' (auto-geocoded)' : '';
    showToast('Address added!' + geoMsg, 'success');
    renderCustomerDetail(custId);
  } catch (err) { showToast('Failed to add address', 'error'); }
}

async function showNewAddressModal(custId, orderId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-plus-circle" style="color:var(--green);margin-right:8px"></i>New Address</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="newAddrLabel" value="Primary" placeholder="e.g. Main Barn, Front Gate"></div>
        <div class="form-group"><label class="form-label">Street *</label><input class="form-input" id="newAddrStreet" placeholder="Street address"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">City *</label><input class="form-input" id="newAddrCity" value="Wellington"></div>
        <div class="form-group"><label class="form-label">State</label><input class="form-input" id="newAddrState" value="FL" style="width:60px"></div>
        <div class="form-group"><label class="form-label">Zip</label><input class="form-input" id="newAddrZip" placeholder="33414"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Gate Code</label><input class="form-input" id="newAddrGate" placeholder="Gate code"></div>
        <div class="form-group"><label class="form-label">Driver Notes</label><input class="form-input" id="newAddrNotes" placeholder="Delivery instructions"></div>
      </div>
      <div style="padding:12px;background:linear-gradient(135deg,#F0FDF4,#ECFDF5);border:1px solid #BBF7D0;border-radius:10px;margin-top:12px">
        <div style="font-weight:700;font-size:13px;color:var(--navy);margin-bottom:10px"><i class="fas fa-map-pin" style="margin-right:6px;color:#16A34A"></i>GPS Coordinates <span style="font-weight:400;font-size:11px;color:var(--gray-400)">(optional)</span></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Latitude</label><input class="form-input" id="newAddrLat" type="number" step="any" placeholder="e.g. 26.6168"></div>
          <div class="form-group"><label class="form-label">Longitude</label><input class="form-input" id="newAddrLng" type="number" step="any" placeholder="e.g. -80.2926"></div>
        </div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:6px">
          <i class="fas fa-info-circle"></i> Enter coordinates manually, or leave blank to auto-geocode from address.
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewAddress(${custId}, ${orderId})"><i class="fas fa-save"></i> Save & Use</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewAddress(custId, orderId) {
  const street = document.getElementById('newAddrStreet').value.trim();
  if (!street) { showToast('Street is required', 'warning'); return; }
  try {
    const ordLatVal = document.getElementById('newAddrLat')?.value?.trim();
    const ordLngVal = document.getElementById('newAddrLng')?.value?.trim();
    const ordPayload = {
      customer_id: custId,
      label: document.getElementById('newAddrLabel').value.trim() || 'Primary',
      street: street,
      city: document.getElementById('newAddrCity').value.trim() || 'Wellington',
      state: document.getElementById('newAddrState').value.trim() || 'FL',
      zip: document.getElementById('newAddrZip').value.trim() || null,
      gate_code: document.getElementById('newAddrGate').value.trim() || null,
      driver_notes: document.getElementById('newAddrNotes').value.trim() || null,
      is_primary: 1,
    };
    if (ordLatVal && ordLngVal) {
      ordPayload.lat = parseFloat(ordLatVal);
      ordPayload.lng = parseFloat(ordLngVal);
    }
    const { data } = await API.post('/addresses', ordPayload);
    // Update the order to use the new address
    await API.put(`/orders/${orderId}`, { address_id: data.id });
    document.querySelector('.modal-overlay').remove();
    showToast('Address created & assigned!', 'success');
    renderOrderDetail(orderId);
  } catch (err) { showToast('Failed to create address', 'error'); }
}

async function showChangeAddressModal(custId, orderId) {
  const { data } = await API.get(`/customers/${custId}`);
  const addrs = data.addresses || [];
  if (addrs.length === 0) { showNewAddressModal(custId, orderId); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:450px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-exchange-alt" style="color:var(--navy-light);margin-right:8px"></i>Change Address</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div style="display:flex;flex-direction:column;gap:8px">
        ${addrs.map(a => `<div style="padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;transition:all 0.15s" 
          onmouseover="this.style.borderColor='var(--navy-light)';this.style.background='var(--gray-50)'" 
          onmouseout="this.style.borderColor='var(--gray-200)';this.style.background='white'"
          onclick="selectOrderAddress(${a.id}, ${orderId})">
          <div style="font-weight:600;font-size:14px">${a.label||'Address'}</div>
          <div style="font-size:13px;color:var(--gray-500)">${a.street}, ${a.city} ${a.state} ${a.zip||''}</div>
          ${a.gate_code?`<div style="font-size:11px;color:var(--orange)"><i class="fas fa-key"></i> ${a.gate_code}</div>`:''}
        </div>`).join('')}
      </div>
      <div style="margin-top:12px;text-align:center">
        <button class="btn btn-outline btn-sm" onclick="this.closest('.modal-overlay').remove();showNewAddressModal(${custId}, ${orderId})"><i class="fas fa-plus"></i> Add New Address</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function selectOrderAddress(addrId, orderId) {
  try {
    await API.put(`/orders/${orderId}`, { address_id: addrId });
    document.querySelector('.modal-overlay').remove();
    showToast('Address changed!', 'success');
    renderOrderDetail(orderId);
  } catch (err) { showToast('Failed to change address', 'error'); }
}

async function viewTicketImage(orderId) {
  try {
    const { data } = await API.get(`/orders/${orderId}`);
    if (!data.order.ticket_image) { showToast('No ticket image attached', 'info'); return; }
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fas fa-receipt" style="color:var(--orange);margin-right:8px"></i>Original Ticket — ${data.order.order_number}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="text-align:center;padding:16px">
        <img src="${data.order.ticket_image}" alt="Order ticket" style="max-width:100%;max-height:70vh;border-radius:10px;border:1px solid var(--gray-200)">
        <div style="margin-top:10px;font-size:12px;color:var(--gray-500)"><i class="fas fa-info-circle"></i> Scanned ticket for order ${data.order.order_number} — ${data.order.business_name}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch (err) { showToast('Failed to load ticket image', 'error'); }
}

// ==================== PACKING LIST PAGE ====================
async function renderPacking() {
  const pc = document.getElementById('pageContent');
  const routeId = window._params?.routeId;
  if (routeId) return renderPackingDetail(routeId);

  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const { data } = await API.get('/routes');
  const activeRoutes = data.routes.filter(r => !['completed','cancelled'].includes(r.status));
  pc.innerHTML = `
    <div class="card">
      <div class="card-header"><h3 class="card-title">Select Route for Packing List</h3></div>
      <div class="card-body">
        ${activeRoutes.length === 0 ? '<div class="empty-state"><i class="fas fa-list-check"></i><h3>No active routes</h3><p>Create a route first to generate packing lists</p></div>' :
          `<div style="display:grid;gap:12px">${activeRoutes.map(r => `
            <div style="padding:16px;border:1px solid var(--gray-200);border-radius:10px;cursor:pointer;transition:border-color 0.15s" onclick="navigate('packing',{routeId:${r.id}})" onmouseover="this.style.borderColor='var(--navy-light)'" onmouseout="this.style.borderColor='var(--gray-200)'">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <strong style="font-size:16px">${r.route_number||'Route'}</strong> ${statusBadge(r.status)}
                  <div style="font-size:13px;color:var(--gray-500);margin-top:4px"><i class="fas fa-calendar"></i> ${formatDate(r.date)} &nbsp; <i class="fas fa-user"></i> ${r.driver_name||'Unassigned'} &nbsp; <i class="fas fa-truck"></i> ${r.truck_name||'—'}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:13px;color:var(--gray-500)">${r.stop_count} stops</div>
                  <div style="font-weight:700">${r.max_pallet_spots||12} pallets</div>
                </div>
              </div>
            </div>`).join('')}</div>`}
      </div>
    </div>`;
}

async function renderPackingDetail(routeId) {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  const { data } = await API.get(`/packing-list/${routeId}`);
  const r = data.route;
  const stops = data.stops;
  // Reverse for LIFO (last delivery loaded first)
  const loadingOrder = [...stops].reverse();
  let totalItems = 0;
  stops.forEach(s => { if (s.items) s.items.forEach(i => { totalItems += i.quantity; }); });

  pc.innerHTML = `
    <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px">
      <button class="btn btn-outline" onclick="navigate('packing')"><i class="fas fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print Packing List</button>
    </div>
    <div class="card packing-list" style="margin-bottom:20px">
      <div class="card-body">
        <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--gray-800)">
          <h2 style="font-size:22px;font-weight:800;margin-bottom:4px">🚛 BRITISH FEED & SUPPLIES</h2>
          <h3 style="font-size:16px;color:var(--gray-600)">PACKING LIST - ${r.route_number||'Route'}</h3>
          <div style="font-size:13px;color:var(--gray-500);margin-top:8px">
            Date: <strong>${formatDate(r.date)}</strong> &nbsp;|&nbsp;
            Driver: <strong>${r.driver_name||'TBD'}</strong> &nbsp;|&nbsp;
            Truck: <strong>${r.truck_name||'TBD'}</strong> &nbsp;|&nbsp;
            Capacity: <strong>${r.max_pallet_spots||12} pallets</strong>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;padding:12px;background:var(--gray-50);border-radius:8px">
          <div style="text-align:center"><div style="font-size:24px;font-weight:800">${stops.length}</div><div style="font-size:12px;color:var(--gray-500)">Stops</div></div>
          <div style="text-align:center"><div style="font-size:24px;font-weight:800">${totalItems}</div><div style="font-size:12px;color:var(--gray-500)">Total Items</div></div>
          <div style="text-align:center"><div style="font-size:24px;font-weight:800">${r.max_pallet_spots||12}</div><div style="font-size:12px;color:var(--gray-500)">Pallet Capacity</div></div>
        </div>
        ${loadingOrder.some(s => s.changed_after_routing) ? `<div style="margin-bottom:12px;padding:10px 14px;background:#FFFBEB;border:2px solid #F59E0B;border-radius:8px;display:flex;align-items:center;gap:8px">
          <i class="fas fa-pen-to-square" style="color:#D97706;font-size:18px"></i>
          <div><strong style="color:#92400E">Orders Modified After Routing</strong><div style="font-size:12px;color:#92400E">Changed items and instructions are highlighted inline below.</div></div>
        </div>` : ''}
        <h4 style="font-weight:700;margin-bottom:12px;color:var(--orange)">📦 LOADING ORDER (Load First → Last Off)</h4>
        ${loadingOrder.map((s, i) => {
          const changed = s.changed_after_routing;
          const changeMap = {};
          (s.changes||[]).forEach(ch => { changeMap[ch.product_id] = ch; });
          return `
          <div class="packing-stop">
            <div class="packing-stop-header">
              <div>
                <div class="loading-order">Load #${i + 1} (Delivery Stop #${s.sequence})</div>
                <strong style="font-size:16px">${s.order_number} - ${s.business_name}</strong>
                <div style="font-size:12px;color:var(--gray-500)">${s.street||''}, ${s.city||''}</div>
              </div>
              <div style="text-align:right"><strong>${s.items?.length||0} items</strong></div>
            </div>
            <table style="font-size:13px">
              <thead><tr><th style="padding:6px 8px">Product</th><th style="padding:6px 8px">SKU</th><th style="padding:6px 8px;text-align:center">Qty</th><th style="padding:6px 8px;text-align:center;width:40px">✓</th></tr></thead>
              <tbody>${(s.items||[]).map(item => {
                const ch = changeMap[item.product_id];
                const isQtyChanged = ch && ch.type === 'qty_changed';
                const isAdded = ch && ch.type === 'added';
                return `
                <tr><td style="padding:6px 8px">${item.name}${isAdded?' <span style="background:#16A34A;color:white;font-size:9px;font-weight:800;padding:1px 6px;border-radius:3px">ADDED</span>':''}</td><td style="padding:6px 8px"><code>${item.sku||''}</code></td>
                <td style="padding:6px 8px;text-align:center;font-weight:700">${isQtyChanged ? `<span style="background:#FEF9C3;padding:2px 6px;border-radius:4px;border:2px solid #F59E0B"><strong style="font-size:15px">${item.quantity}</strong> <span style="font-size:11px;color:#92400E;text-decoration:line-through">(was ${ch.old_quantity})</span></span>` : `${item.quantity}`} ${item.unit_type||'bags'}${isAdded ? ' <span style="background:#DCFCE7;padding:1px 4px;border-radius:3px;font-size:11px;color:#166534;border:1px solid #86EFAC">NEW</span>' : ''}</td>
                <td style="padding:6px 8px;text-align:center">☐</td></tr>`}).join('')}
              ${(s.changes||[]).filter(ch => ch.type==='removed').map(ch => `
                <tr style="background:#FEE2E2"><td style="padding:6px 8px;text-decoration:line-through;color:#991B1B">${ch.name} <span style="font-size:9px;font-weight:800;background:#DC2626;color:white;padding:1px 6px;border-radius:3px">REMOVED</span></td><td style="padding:6px 8px;text-decoration:line-through;color:#991B1B"><code>${ch.sku||''}</code></td>
                <td style="padding:6px 8px;text-align:center;font-weight:700;color:#991B1B;text-decoration:line-through">${ch.old_quantity} ${ch.unit_type||'bags'}</td>
                <td style="padding:6px 8px;text-align:center">—</td></tr>`).join('')}
              </tbody>
            </table>
            ${s.instructions_changed?`<div style="margin-top:8px;padding:6px 10px;background:#FFFBEB;border:2px solid #F59E0B;border-radius:4px;font-size:12px"><strong><i class="fas fa-pen" style="color:#D97706"></i> Instructions updated:</strong> <span style="font-weight:700">${s.special_instructions||'<em>(cleared)</em>'}</span></div>`
            :s.special_instructions?`<div style="margin-top:8px;padding:6px 10px;background:#FFF7ED;border-radius:4px;font-size:12px"><strong>Note:</strong> ${s.special_instructions}</div>`:''}
          </div>`}).join('')}
        <div style="margin-top:20px;padding:16px;border:2px solid var(--gray-800);border-radius:8px;text-align:center">
          <strong>TOTAL LOAD:</strong> ${totalItems} items &bull; ${stops.length} stops &bull; Truck: ${r.max_pallet_spots||12} pallets
        </div>
        <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:13px">
          <div style="border-top:1px solid var(--gray-300);padding-top:8px">Loaded By: ________________________</div>
          <div style="border-top:1px solid var(--gray-300);padding-top:8px">Verified By: ________________________</div>
        </div>
      </div>
    </div>`;
}

// ==================== AUTO-CALCULATE PALLET DIMENSIONS FROM BAG SIZE ====================
function autoCalcPalletDims(prefix) {
  const bagL = parseFloat(document.getElementById(prefix + 'ProdBagL')?.value) || 0;
  const bagW = parseFloat(document.getElementById(prefix + 'ProdBagW')?.value) || 0;
  const bagH = parseFloat(document.getElementById(prefix + 'ProdBagH')?.value) || 0;
  const autoCalcEl = document.getElementById(prefix + 'ProdAutoCalc');

  if (bagL > 0 && bagW > 0 && bagH > 0) {
    // Standard pallet = 48" x 40" base, max height ~72"
    const palletBaseL = 48, palletBaseW = 40, maxPalletH = 72;
    // How many bags fit per layer
    const bagsPerRow = Math.floor(palletBaseL / bagL);
    const bagsPerCol = Math.floor(palletBaseW / bagW);
    const bagsPerLayer = bagsPerRow * bagsPerCol;
    // How many layers
    const maxLayers = Math.floor(maxPalletH / bagH);
    const totalBags = bagsPerLayer * maxLayers;
    const palletH = maxLayers * bagH;

    // Auto-fill pallet fields
    const palletQtyEl = document.getElementById(prefix + 'ProdPalletQty');
    const palletWeightEl = document.getElementById(prefix + 'ProdPalletWeight');
    const palletLEl = document.getElementById(prefix + 'ProdLength');
    const palletWEl = document.getElementById(prefix + 'ProdWidth');
    const palletHEl = document.getElementById(prefix + 'ProdHeight');

    if (palletQtyEl) palletQtyEl.value = totalBags;
    if (palletLEl) palletLEl.value = palletBaseL;
    if (palletWEl) palletWEl.value = palletBaseW;
    if (palletHEl) palletHEl.value = Math.round(palletH * 10) / 10;

    if (autoCalcEl) {
      autoCalcEl.style.display = 'block';
      autoCalcEl.innerHTML = `<i class="fas fa-calculator" style="color:var(--green)"></i> <strong>Auto-calculated:</strong> ${bagsPerLayer} bags/layer x ${maxLayers} layers = <strong>${totalBags} bags/pallet</strong> | Pallet: ${palletBaseL}"x${palletBaseW}"x${Math.round(palletH)}"`;
    }
  } else {
    if (autoCalcEl) autoCalcEl.style.display = 'none';
  }
}

// ==================== DRIVERS MANAGEMENT PAGE ====================
async function renderDriversManagement() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
    const showArchived = _archiveToggles.users || false;
    const [usersRes, assignmentsRes] = await Promise.all([
      API.get('/users' + (showArchived ? '?include_archived=1' : '')),
      API.get('/driver-truck-assignments')
    ]);
    const users = usersRes.data.users || [];
    const allAssignments = assignmentsRes.data.assignments || [];
    const drivers = users.filter(u => u.role === 'driver');
    const others = users.filter(u => u.role !== 'driver');
    const langNames = { en: 'English', es: 'Español', ht: 'Kreyòl' };

    function driverTruckPills(driverId) {
      const da = allAssignments.filter(a => a.driver_id === driverId);
      if (da.length === 0) return `<span style="font-size:11px;color:var(--gray-400)">None assigned</span>`;
      return da.map(a => `<span class="truck-assignment-pill ${a.is_primary?'primary':''}" style="font-size:11px;padding:2px 6px">
        <i class="fas fa-truck" style="font-size:9px"></i> ${a.truck_name}${a.is_primary?' <i class="fas fa-star" style="color:#F59E0B;font-size:8px"></i>':''}
      </span>`).join(' ');
    }

    pc.innerHTML = `
      <div class="filters-bar no-print">
        ${archiveToggleBtn(showArchived, "toggleArchive('users','renderDriversManagement')")}
        <button class="btn btn-primary" onclick="showNewDriverModal()"><i class="fas fa-plus"></i> ${t('drivers_new')}</button>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-id-card" style="color:var(--navy-light);margin-right:8px"></i> Drivers</h3></div>
        <div class="table-container">
          <table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Language</th><th>${t('assign_trucks')}</th><th>Verizon</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${drivers.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--gray-400)">No drivers configured</td></tr>' :
              drivers.map(d => `<tr ${!d.active?'style="opacity:0.5"':''}>
                <td><strong>${d.name}</strong>${!d.active?archiveBadge():''}</td>
                <td>${d.email||'-'}</td>
                <td>${d.phone||'-'}</td>
                <td><span class="badge badge-confirmed">${langNames[d.preferred_language]||d.preferred_language||'English'}</span></td>
                <td style="max-width:200px">
                  <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                    ${driverTruckPills(d.id)}
                    <button class="btn-icon" style="font-size:11px;color:var(--navy-light)" onclick="showDriverTruckAssignments(${d.id})" title="${t('assign_add_truck')}"><i class="fas fa-plus-circle"></i></button>
                  </div>
                </td>
                <td>${d.verizon_driver_id ? `<span style="font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600;background:#F5F3FF;color:#7C3AED"><i class="fas fa-satellite-dish" style="font-size:9px"></i> Linked</span>` : `<a href="#" onclick="event.preventDefault();navigate('fleet_sync')" style="font-size:11px;color:var(--gray-400)"><i class="fas fa-unlink"></i> Link</a>`}</td>
                <td>${d.active ? '<span class="badge badge-confirmed">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
                <td style="display:flex;gap:4px"><button class="btn btn-outline btn-sm" onclick="showEditDriverModal(${d.id})"><i class="fas fa-edit"></i></button>${archiveActionBtn('users', d.id, !d.active, 'renderDriversManagement')}</td>
              </tr>`).join('')}
          </tbody></table>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-users" style="color:var(--gray-400);margin-right:8px"></i> Other Staff (Dispatch, Admin, Warehouse)</h3></div>
        <div class="table-container">
          <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Language</th><th></th></tr></thead>
          <tbody>
            ${others.map(u => `<tr ${!u.active?'style="opacity:0.5"':''}>
              <td><strong>${u.name}</strong>${!u.active?archiveBadge():''}</td>
              <td>${u.email||'-'}</td>
              <td>${statusBadge(u.role)}</td>
              <td>${u.phone||'-'}</td>
              <td>${langNames[u.preferred_language]||u.preferred_language||'English'}</td>
              <td style="display:flex;gap:4px"><button class="btn btn-outline btn-sm" onclick="showEditDriverModal(${u.id})"><i class="fas fa-edit"></i></button>${archiveActionBtn('users', u.id, !u.active, 'renderDriversManagement')}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </div>`;
  } catch (err) {
    pc.innerHTML = `<div class="card" style="padding:40px;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i><h3>Failed to load users</h3><button class="btn btn-primary" onclick="renderDriversManagement()"><i class="fas fa-redo"></i> Retry</button></div>`;
  }
}

function showNewDriverModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:550px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-user-plus" style="color:var(--green)"></i> ${t('drivers_new')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="newDriverName" placeholder="Full name"></div>
        <div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" id="newDriverEmail" placeholder="email@britishfeed.com"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="newDriverPhone" placeholder="561-555-1234"></div>
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-select" id="newDriverRole"><option value="driver">Driver</option><option value="dispatcher">Dispatcher</option><option value="warehouse">Warehouse</option><option value="admin">Admin</option></select>
        </div>
        <div class="form-group"><label class="form-label">${t('drivers_preferred_lang')}</label>
          <select class="form-select" id="newDriverLang"><option value="en">English</option><option value="es">Español</option><option value="ht">Kreyòl</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="newDriverPassword" type="password" value="driver123" placeholder="Initial password"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitNewDriver()"><i class="fas fa-check"></i> ${t('drivers_new')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewDriver() {
  const name = document.getElementById('newDriverName').value.trim();
  const email = document.getElementById('newDriverEmail').value.trim();
  if (!name || !email) { showToast('Name and email are required', 'warning'); return; }
  try {
    await API.post('/users', {
      name, email,
      phone: document.getElementById('newDriverPhone').value.trim() || null,
      role: document.getElementById('newDriverRole').value,
      preferred_language: document.getElementById('newDriverLang').value,
      password: document.getElementById('newDriverPassword').value || 'driver123',
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Driver added!');
    renderDriversManagement();
  } catch (err) { showToast('Failed to add driver', 'error'); }
}

async function showEditDriverModal(id) {
  const { data } = await API.get('/users');
  const user = data.users.find(u => u.id === id);
  if (!user) { showToast('User not found', 'error'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:550px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-user-edit" style="color:var(--navy-light)"></i> Edit User</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="editDriverName" value="${user.name}"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="editDriverEmail" value="${user.email||''}"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="editDriverPhone" value="${user.phone||''}"></div>
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-select" id="editDriverRole">${['admin','dispatcher','warehouse','driver','customer'].map(r=>`<option value="${r}" ${user.role===r?'selected':''}>${r}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">${t('drivers_preferred_lang')}</label>
          <select class="form-select" id="editDriverLang">${[['en','English'],['es','Español'],['ht','Kreyòl']].map(([v,l])=>`<option value="${v}" ${user.preferred_language===v?'selected':''}>${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Active</label>
          <select class="form-select" id="editDriverActive"><option value="1" ${user.active?'selected':''}>Yes</option><option value="0" ${!user.active?'selected':''}>No</option></select>
        </div>
        <div class="form-group"><label class="form-label">New Password (optional)</label><input class="form-input" id="editDriverPassword" type="password" placeholder="Leave blank to keep current"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitEditDriver(${id})"><i class="fas fa-save"></i> ${t('common_save')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitEditDriver(id) {
  const name = document.getElementById('editDriverName').value.trim();
  if (!name) { showToast('Name required', 'warning'); return; }
  const payload = {
    name,
    email: document.getElementById('editDriverEmail').value.trim() || null,
    phone: document.getElementById('editDriverPhone').value.trim() || null,
    role: document.getElementById('editDriverRole').value,
    preferred_language: document.getElementById('editDriverLang').value,
    active: parseInt(document.getElementById('editDriverActive').value),
  };
  const pw = document.getElementById('editDriverPassword').value;
  if (pw) payload.password = pw;
  try {
    await API.put(`/users/${id}`, payload);
    document.querySelector('.modal-overlay')?.remove();
    showToast('User updated!');
    renderDriversManagement();
  } catch (err) { showToast('Failed to update user', 'error'); }
}

// ==================== FLEET MAINTENANCE PAGE ====================
async function renderMaintenance() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
    const [maintRes, issuesRes, remindersRes, trucksRes] = await Promise.all([
      API.get('/fleet/maintenance'),
      API.get('/fleet/issues'),
      API.get('/fleet/reminders'),
      API.get('/trucks'),
    ]);
    const maintenance = maintRes.data.maintenance || [];
    const issues = issuesRes.data.issues || [];
    const reminders = remindersRes.data.reminders || [];
    const trucks = trucksRes.data.trucks || [];
    window._maintTrucks = trucks;

    const serviceIcons = { routine:'fa-wrench', repair:'fa-tools', inspection:'fa-search', tire:'fa-circle', oil:'fa-oil-can', brake:'fa-stop-circle', other:'fa-cog' };
    const sevColors = { critical:'#DC2626', high:'#F97316', medium:'#EAB308', low:'#6B7280' };
    const catIcons = { engine:'fa-engine', tire:'fa-circle', brake:'fa-stop-circle', electrical:'fa-bolt', body:'fa-car-side', fluid:'fa-tint', other:'fa-wrench' };

    pc.innerHTML = `
      <div class="filters-bar no-print">
        <button class="btn btn-primary" onclick="showNewMaintenanceModal()"><i class="fas fa-plus"></i> ${t('maint_new_service')}</button>
        <button class="btn btn-outline" onclick="showReportIssueModal()"><i class="fas fa-exclamation-triangle"></i> ${t('maint_report_issue')}</button>
        <button class="btn btn-outline" onclick="showUploadRecordModal()"><i class="fas fa-upload"></i> ${t('maint_upload_record')}</button>
      </div>

      <!-- Reminders Banner -->
      ${reminders.length > 0 ? `<div style="background:linear-gradient(135deg,#FEF3C7,#FFFBEB);border:1px solid #FCD34D;border-radius:12px;padding:16px;margin-bottom:20px">
        <h4 style="font-size:14px;font-weight:700;color:#92400E;margin-bottom:10px"><i class="fas fa-bell" style="color:#F59E0B"></i> ${t('maint_reminders')} (${reminders.length})</h4>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${reminders.map(r => `<div style="background:white;border-radius:8px;padding:10px 14px;border:1px solid #FCD34D;flex:1;min-width:250px">
            <div style="font-weight:600;color:${r.status==='overdue'?'#DC2626':'#92400E'}">${r.status==='overdue'?'⚠️ OVERDUE':'📅'} ${r.service_type} — ${r.truck_name}</div>
            <div style="font-size:12px;color:#78716C;margin-top:2px">${r.description}</div>
            <div style="font-size:11px;color:#92400E;margin-top:4px">${r.scheduled_date ? 'Due: '+formatDate(r.scheduled_date) : 'No date set'}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Maintenance Schedule -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-calendar-check" style="color:var(--navy-light);margin-right:8px"></i> Service Schedule</h3></div>
        <div class="table-container">
          <table><thead><tr><th>Truck</th><th>Service</th><th>Description</th><th>Date</th><th>Status</th><th>Cost</th><th>Vendor</th><th></th></tr></thead>
          <tbody>
            ${maintenance.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--gray-400)">No scheduled maintenance</td></tr>' :
              maintenance.map(m => `<tr>
                <td><strong>${m.truck_name||'—'}</strong><div style="font-size:11px;color:var(--gray-400)">${m.plate_number||''}</div></td>
                <td><i class="fas ${serviceIcons[m.service_type]||'fa-wrench'}" style="color:var(--navy-light);margin-right:4px"></i>${m.service_type}</td>
                <td style="max-width:200px">${m.description}</td>
                <td>${m.scheduled_date ? formatDate(m.scheduled_date) : '-'}</td>
                <td>${statusBadge(m.status)}</td>
                <td>${m.cost ? '$'+Number(m.cost).toFixed(2) : '-'}</td>
                <td>${m.vendor||'-'}</td>
                <td style="display:flex;gap:4px">
                  <button class="btn btn-outline btn-sm" onclick="showEditMaintenanceModal(${m.id})" title="Edit"><i class="fas fa-edit"></i></button>
                  ${m.status !== 'completed' ? `<button class="btn btn-outline btn-sm" style="color:var(--green)" onclick="completeMaintenanceItem(${m.id})" title="Complete"><i class="fas fa-check"></i></button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody></table>
        </div>
      </div>

      <!-- Driver-Reported Issues -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-exclamation-triangle" style="color:var(--orange);margin-right:8px"></i> ${t('maint_issues')} <span class="badge" style="background:#FEF2F2;color:#DC2626;font-size:11px;margin-left:6px">${issues.filter(i=>i.status==='open').length} open</span></h3></div>
        <div class="card-body" style="padding:0">
          ${issues.length === 0 ? `<div style="padding:24px;text-align:center;color:var(--gray-400)">${t('maint_no_issues')}</div>` :
            issues.map(iss => `<div style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--gray-100);align-items:flex-start">
              ${iss.photo_data ? `<img src="${iss.photo_data}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--gray-200);cursor:pointer" onclick="showIssuePhoto('${iss.id}')" title="Click to enlarge">` : 
                `<div style="width:60px;height:60px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${catIcons[iss.category]||'fa-wrench'}" style="color:var(--gray-400)"></i></div>`}
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="width:8px;height:8px;border-radius:50%;background:${sevColors[iss.severity]||'#6B7280'};flex-shrink:0"></span>
                  <strong>${iss.category}</strong>
                  <span class="badge" style="font-size:10px;background:${sevColors[iss.severity]}20;color:${sevColors[iss.severity]}">${iss.severity}</span>
                  ${statusBadge(iss.status)}
                </div>
                <div style="font-size:13px;margin-top:4px">${iss.description}</div>
                <div style="font-size:11px;color:var(--gray-400);margin-top:4px"><i class="fas fa-truck"></i> ${iss.truck_name||'—'} &bull; <i class="fas fa-user"></i> ${iss.reporter_name||'Unknown'} &bull; ${dayjs(iss.created_at).format('MMM D, h:mm A')}</div>
                ${iss.resolution_notes ? `<div style="font-size:12px;color:var(--green);margin-top:4px;padding:4px 8px;background:#ECFDF5;border-radius:4px"><i class="fas fa-check-circle"></i> ${iss.resolution_notes}</div>` : ''}
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                ${iss.status === 'open' ? `<button class="btn btn-outline btn-sm" style="color:var(--green)" onclick="resolveIssue(${iss.id})" title="Resolve"><i class="fas fa-check"></i></button>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  } catch (err) {
    pc.innerHTML = `<div class="card" style="padding:40px;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i><h3>Failed to load maintenance data</h3><p style="color:var(--gray-500)">${err.message}</p><button class="btn btn-primary" onclick="renderMaintenance()"><i class="fas fa-redo"></i> Retry</button></div>`;
  }
}

function showNewMaintenanceModal() {
  const trucks = window._maintTrucks || [];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:600px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-calendar-plus" style="color:var(--green)"></i> ${t('maint_new_service')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Truck *</label>
          <select class="form-select" id="maintTruck">${trucks.map(tk=>`<option value="${tk.id}">${tk.name} (${tk.plate_number||'no plate'})</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">${t('maint_service_type')}</label>
          <select class="form-select" id="maintType"><option value="routine">Routine</option><option value="oil">Oil Change</option><option value="tire">Tire Service</option><option value="brake">Brake Service</option><option value="inspection">Inspection</option><option value="repair">Repair</option><option value="other">Other</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">${t('maint_description')} *</label><textarea class="form-textarea" id="maintDesc" rows="2" placeholder="What service is needed..."></textarea></div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">${t('maint_scheduled_date')}</label><input class="form-input" type="date" id="maintDate" value="${dayjs().add(7,'day').format('YYYY-MM-DD')}"></div>
        <div class="form-group"><label class="form-label">${t('maint_cost')}</label><input class="form-input" type="number" step="0.01" id="maintCost" placeholder="0.00"></div>
        <div class="form-group"><label class="form-label">${t('maint_vendor')}</label><input class="form-input" id="maintVendor" placeholder="Service provider"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Mileage at Service</label><input class="form-input" type="number" id="maintMileage" placeholder="Current odometer"></div>
        <div class="form-group"><label class="form-label">Next Service Date</label><input class="form-input" type="date" id="maintNextDate"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="maintNotes" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitNewMaintenance()"><i class="fas fa-calendar-check"></i> Schedule</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitNewMaintenance() {
  const desc = document.getElementById('maintDesc').value.trim();
  if (!desc) { showToast('Description required', 'warning'); return; }
  try {
    await API.post('/fleet/maintenance', {
      truck_id: parseInt(document.getElementById('maintTruck').value),
      service_type: document.getElementById('maintType').value,
      description: desc,
      scheduled_date: document.getElementById('maintDate').value || null,
      cost: parseFloat(document.getElementById('maintCost').value) || 0,
      vendor: document.getElementById('maintVendor').value.trim() || null,
      mileage_at_service: parseInt(document.getElementById('maintMileage').value) || null,
      next_service_date: document.getElementById('maintNextDate').value || null,
      notes: document.getElementById('maintNotes').value.trim() || null,
      created_by: currentUser?.id || null,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Service scheduled!');
    renderMaintenance();
  } catch (err) { showToast('Failed to schedule service', 'error'); }
}

async function showEditMaintenanceModal(id) {
  const { data } = await API.get('/fleet/maintenance');
  const m = data.maintenance.find(x => x.id === id);
  if (!m) { showToast('Record not found', 'error'); return; }
  const trucks = window._maintTrucks || [];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:600px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-edit" style="color:var(--navy-light)"></i> Edit Service</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Truck</label>
          <select class="form-select" id="editMaintTruck">${trucks.map(tk=>`<option value="${tk.id}" ${m.truck_id===tk.id?'selected':''}>${tk.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Type</label>
          <select class="form-select" id="editMaintType">${['routine','oil','tire','brake','inspection','repair','other'].map(tp=>`<option value="${tp}" ${m.service_type===tp?'selected':''}>${tp}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Description *</label><textarea class="form-textarea" id="editMaintDesc" rows="2">${m.description}</textarea></div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Scheduled Date</label><input class="form-input" type="date" id="editMaintDate" value="${m.scheduled_date||''}"></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-select" id="editMaintStatus">${['scheduled','in_progress','completed','overdue'].map(s=>`<option value="${s}" ${m.status===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Cost</label><input class="form-input" type="number" step="0.01" id="editMaintCost" value="${m.cost||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Vendor</label><input class="form-input" id="editMaintVendor" value="${m.vendor||''}"></div>
        <div class="form-group"><label class="form-label">Next Service Date</label><input class="form-input" type="date" id="editMaintNextDate" value="${m.next_service_date||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="editMaintNotes" rows="2">${m.notes||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" style="color:var(--red)" onclick="deleteMaintenance(${id});this.closest('.modal-overlay').remove()"><i class="fas fa-trash"></i> Delete</button>
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitEditMaintenance(${id})"><i class="fas fa-save"></i> ${t('common_save')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitEditMaintenance(id) {
  try {
    await API.put(`/fleet/maintenance/${id}`, {
      truck_id: parseInt(document.getElementById('editMaintTruck').value),
      service_type: document.getElementById('editMaintType').value,
      description: document.getElementById('editMaintDesc').value.trim(),
      scheduled_date: document.getElementById('editMaintDate').value || null,
      status: document.getElementById('editMaintStatus').value,
      cost: parseFloat(document.getElementById('editMaintCost').value) || 0,
      vendor: document.getElementById('editMaintVendor').value.trim() || null,
      next_service_date: document.getElementById('editMaintNextDate').value || null,
      notes: document.getElementById('editMaintNotes').value.trim() || null,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Service updated!');
    renderMaintenance();
  } catch (err) { showToast('Failed to update', 'error'); }
}

async function completeMaintenanceItem(id) {
  if (!confirm('Mark this service as completed?')) return;
  try {
    await API.put(`/fleet/maintenance/${id}`, { status: 'completed', completed_date: new Date().toISOString().split('T')[0] });
    showToast('Service marked complete!');
    renderMaintenance();
  } catch (err) { showToast('Failed to update', 'error'); }
}

async function deleteMaintenance(id) {
  if (!confirm('Delete this maintenance record?')) return;
  try { await API.delete(`/fleet/maintenance/${id}`); showToast('Deleted'); renderMaintenance(); } catch(e) { showToast('Failed', 'error'); }
}

function showReportIssueModal() {
  const trucks = window._maintTrucks || [];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:600px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-exclamation-triangle" style="color:var(--orange)"></i> ${t('maint_report_issue')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Truck *</label>
          <select class="form-select" id="issueTruck">${trucks.map(tk=>`<option value="${tk.id}">${tk.name} (${tk.plate_number||'no plate'})</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">${t('maint_severity')}</label>
          <select class="form-select" id="issueSeverity"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">${t('maint_category')}</label>
        <select class="form-select" id="issueCategory"><option value="engine">Engine</option><option value="tire">Tire</option><option value="brake">Brake</option><option value="electrical">Electrical</option><option value="body">Body</option><option value="fluid">Fluid/Leak</option><option value="other">Other</option></select>
      </div>
      <div class="form-group"><label class="form-label">${t('maint_description')} *</label><textarea class="form-textarea" id="issueDesc" rows="3" placeholder="Describe the issue in detail..."></textarea></div>
      <div class="form-group">
        <label class="form-label"><i class="fas fa-camera" style="color:var(--orange);margin-right:4px"></i> Attach Photo</label>
        <div class="proof-upload-area" style="min-height:80px" id="issuePhotoArea">
          <div id="issuePhotoPlaceholder" style="text-align:center;padding:16px">
            <i class="fas fa-camera" style="font-size:24px;color:var(--gray-300);margin-bottom:4px"></i>
            <div style="font-size:12px;color:var(--gray-400);margin-bottom:8px">Upload or snap a photo of the issue</div>
            <div style="display:flex;gap:8px;justify-content:center">
              <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden"><i class="fas fa-upload"></i> Upload Photo<input type="file" accept="*/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="handleIssuePhoto(event)"></label>
              <button class="btn btn-outline btn-sm" onclick="captureIssuePhoto()"><i class="fas fa-camera"></i> Take Photo</button>
            </div>
          </div>
          <div id="issuePhotoPreview" style="display:none;text-align:center">
            <img id="issuePhotoImg" style="max-height:150px;max-width:100%;border-radius:8px;object-fit:contain">
            <div style="margin-top:6px"><span class="badge badge-confirmed"><i class="fas fa-check"></i> Photo attached</span></div>
            <div style="margin-top:6px">
              <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden"><i class="fas fa-redo"></i> Replace<input type="file" accept="*/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="handleIssuePhoto(event)"></label>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitIssueReport()"><i class="fas fa-paper-plane"></i> Submit Issue</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  window._issuePhotoData = null;
}

function triggerIssueUpload(event) {
  // Legacy - no longer used, kept for safety
  if (event.target.closest('button') || event.target.closest('label')) return;
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = '*/*';
  tempInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  tempInput.onchange = function(e) { handleIssuePhoto(e); tempInput.remove(); };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function captureIssuePhoto() {
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = 'image/*';
  tempInput.capture = 'environment';
  tempInput.style.display = 'none';
  tempInput.onchange = function(e) { handleIssuePhoto(e); tempInput.remove(); };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function handleIssuePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    window._issuePhotoData = e.target.result;
    document.getElementById('issuePhotoPlaceholder').style.display = 'none';
    document.getElementById('issuePhotoPreview').style.display = 'block';
    document.getElementById('issuePhotoImg').src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitIssueReport() {
  const desc = document.getElementById('issueDesc').value.trim();
  if (!desc) { showToast('Description required', 'warning'); return; }
  try {
    await API.post('/fleet/issues', {
      truck_id: parseInt(document.getElementById('issueTruck').value),
      reported_by: currentUser?.id || 1,
      severity: document.getElementById('issueSeverity').value,
      category: document.getElementById('issueCategory').value,
      description: desc,
      photo_data: window._issuePhotoData || null,
    });
    window._issuePhotoData = null;
    document.querySelector('.modal-overlay')?.remove();
    showToast('Issue reported!');
    renderMaintenance();
  } catch (err) { showToast('Failed to report issue', 'error'); }
}

function showIssuePhoto(issueId) {
  // Find the issue img and enlarge it
  const imgs = document.querySelectorAll(`img[onclick*="${issueId}"]`);
  if (imgs.length > 0) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal" style="max-width:700px">
      <div class="modal-header"><h3 class="modal-title">Issue Photo</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
      <div class="modal-body" style="text-align:center"><img src="${imgs[0].src}" style="max-width:100%;max-height:70vh;border-radius:10px"></div>
    </div>`;
    document.body.appendChild(modal);
  }
}

async function resolveIssue(id) {
  const notes = prompt('Resolution notes (what was done to fix it):');
  if (notes === null) return;
  try {
    await API.put(`/fleet/issues/${id}`, { status: 'resolved', resolution_notes: notes || 'Resolved', resolved_by: currentUser?.id || 1 });
    showToast('Issue resolved!');
    renderMaintenance();
  } catch (err) { showToast('Failed to resolve', 'error'); }
}

function showUploadRecordModal() {
  const trucks = window._maintTrucks || [];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:500px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-file-upload" style="color:var(--navy-light)"></i> ${t('maint_upload_record')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Truck *</label>
        <select class="form-select" id="recordTruck">${trucks.map(tk=>`<option value="${tk.id}">${tk.name}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Record Type</label>
        <select class="form-select" id="recordType"><option value="document">Document</option><option value="invoice">Invoice</option><option value="photo">Photo</option><option value="inspection_report">Inspection Report</option></select>
      </div>
      <div class="form-group"><label class="form-label">File</label>
        <input type="file" class="form-input" id="recordFile" accept="image/*,.pdf,.doc,.docx" onchange="handleRecordFile(event)">
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="recordNotes" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitUploadRecord()"><i class="fas fa-upload"></i> Upload</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  window._recordFileData = null;
  window._recordFileName = null;
}

function handleRecordFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  window._recordFileName = file.name;
  const reader = new FileReader();
  reader.onload = function(e) { window._recordFileData = e.target.result; };
  reader.readAsDataURL(file);
}

async function submitUploadRecord() {
  if (!window._recordFileData) { showToast('Please select a file', 'warning'); return; }
  try {
    await API.post('/fleet/records', {
      truck_id: parseInt(document.getElementById('recordTruck').value),
      record_type: document.getElementById('recordType').value,
      file_name: window._recordFileName,
      file_data: window._recordFileData,
      notes: document.getElementById('recordNotes').value.trim() || null,
      uploaded_by: currentUser?.id || null,
    });
    window._recordFileData = null;
    window._recordFileName = null;
    document.querySelector('.modal-overlay')?.remove();
    showToast('Record uploaded!');
    renderMaintenance();
  } catch (err) { showToast('Failed to upload record', 'error'); }
}

// ==================== RECURRING ORDERS PAGE ====================
var DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function frequencyLabel(freq, interval) {
  switch(freq) {
    case 'weekly': return t('recurring_weekly');
    case 'biweekly': return t('recurring_biweekly');
    case 'monthly': return t('recurring_monthly');
    case 'custom': return `${t('recurring_custom')} (${interval} ${t('common_date').toLowerCase().includes('fecha')?'días':'days'})`;
    default: return freq;
  }
}

function recurringStatusBadge(status) {
  const map = {
    active: { bg: '#DCFCE7', color: '#16A34A', icon: 'fa-check-circle', label: t('recurring_status_active') },
    paused: { bg: '#FEF3C7', color: '#D97706', icon: 'fa-pause-circle', label: t('recurring_status_paused') },
    cancelled: { bg: '#FEE2E2', color: '#DC2626', icon: 'fa-times-circle', label: t('recurring_status_cancelled') },
  };
  const s = map[status] || map.active;
  return `<span class="badge" style="background:${s.bg};color:${s.color}"><i class="fas ${s.icon}"></i> ${s.label}</span>`;
}

async function renderRecurring() {
  const pc = document.getElementById('pageContent');
  if (window._params?.viewId) { return renderRecurringDetail(window._params.viewId); }
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
    const showArchived = _archiveToggles.recurring || false;
    const { data } = await API.get('/recurring-schedules' + (showArchived ? '?include_archived=1' : ''));
    const schedules = data.schedules || [];

    const activeScheds = schedules.filter(s => !s.archived && s.status === 'active');
    const paused = schedules.filter(s => !s.archived && s.status === 'paused');
    const cancelled = schedules.filter(s => !s.archived && s.status === 'cancelled');
    const archivedScheds = schedules.filter(s => s.archived);

    pc.innerHTML = `
      <div class="filters-bar no-print">
        <h3 style="font-weight:700;font-size:16px"><i class="fas fa-sync-alt" style="color:#7C3AED;margin-right:8px"></i>${t('recurring_title')}</h3>
        <div style="margin-left:auto;display:flex;gap:8px">
          ${archiveToggleBtn(showArchived, "toggleArchive('recurring','renderRecurring')")}
          <button class="btn btn-outline btn-sm" style="color:#7C3AED;border-color:#7C3AED" onclick="generateAllDue()"><i class="fas fa-bolt"></i> ${t('recurring_generate_due')}</button>
          <button class="btn btn-primary" style="background:#7C3AED" onclick="showNewRecurringModal()"><i class="fas fa-plus"></i> ${t('recurring_new')}</button>
        </div>
      </div>
      ${schedules.length === 0 ? `
        <div class="card"><div class="empty-state" style="padding:60px">
          <i class="fas fa-sync-alt fa-3x" style="color:#D8B4FE;margin-bottom:16px"></i>
          <h3 style="color:var(--gray-700)">${t('recurring_no_schedules')}</h3>
          <p style="color:var(--gray-500);margin-top:8px">${t('recurring_create_first')}</p>
          <button class="btn btn-primary" style="background:#7C3AED;margin-top:16px" onclick="showNewRecurringModal()"><i class="fas fa-plus"></i> ${t('recurring_new')}</button>
        </div></div>` : `
        ${activeScheds.length > 0 ? recurringSection(t('recurring_status_active'), 'fa-check-circle', '#16A34A', activeScheds, false) : ''}
        ${paused.length > 0 ? recurringSection(t('recurring_status_paused'), 'fa-pause-circle', '#D97706', paused, false) : ''}
        ${cancelled.length > 0 ? recurringSection(t('recurring_status_cancelled'), 'fa-times-circle', '#DC2626', cancelled, true) : ''}
        ${showArchived && archivedScheds.length > 0 ? recurringSection(t('archive_section'), 'fa-archive', '#991B1B', archivedScheds, true) : ''}
      `}`;
  } catch (err) { pc.innerHTML = `<div class="card"><div class="empty-state" style="padding:40px"><p style="color:var(--red)">Error loading schedules</p></div></div>`; }
}

function recurringSection(title, icon, color, items, collapsed) {
  return `<div class="card" style="margin-bottom:16px">
    <div class="card-header" style="cursor:pointer;user-select:none" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.section-chevron').classList.toggle('fa-chevron-down');this.querySelector('.section-chevron').classList.toggle('fa-chevron-right')">
      <h3 class="card-title" style="display:flex;align-items:center;gap:8px">
        <i class="fas ${icon}" style="color:${color}"></i> ${title}
        <span class="badge" style="background:${color}20;color:${color};font-size:12px">${items.length}</span>
      </h3>
      <i class="fas ${collapsed?'fa-chevron-right':'fa-chevron-down'} section-chevron" style="color:var(--gray-400);font-size:12px"></i>
    </div>
    <div class="table-container" style="${collapsed?'display:none':''}">
      <table><thead><tr><th>${t('nav_customers')}</th><th>${t('order_address')}</th><th>${t('recurring_frequency')}</th><th>${t('recurring_next_delivery')}</th><th>Items</th><th>${t('recurring_orders_generated')}</th><th>${t('common_status')}</th><th></th></tr></thead>
      <tbody>${items.map(s => `<tr onclick="navigate('recurring',{viewId:${s.id}})" style="cursor:pointer">
        <td><strong style="color:var(--navy)">${s.business_name}</strong></td>
        <td style="font-size:12px;color:var(--gray-500)">${s.street||''} ${s.city||''}</td>
        <td>${frequencyLabel(s.frequency, s.interval_days)}</td>
        <td>${formatDate(s.next_delivery_date)}</td>
        <td><span class="badge badge-normal">${s.item_count} items</span></td>
        <td><span class="badge" style="background:#EDE9FE;color:#7C3AED">${s.orders_generated}</span></td>
        <td>${recurringStatusBadge(s.status)}</td>
        <td><i class="fas fa-chevron-right" style="color:var(--gray-400)"></i></td>
      </tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}

async function renderRecurringDetail(id) {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
    const { data } = await API.get(`/recurring-schedules/${id}`);
    const s = data.schedule;
    const items = data.items || [];
    const log = data.log || [];
    pc.innerHTML = `
      <div class="no-print" style="margin-bottom:16px"><button class="btn btn-outline" onclick="navigate('recurring')"><i class="fas fa-arrow-left"></i> ${t('recurring_title')}</button></div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div><h3 class="card-title" style="font-size:20px"><i class="fas fa-sync-alt" style="color:#7C3AED;margin-right:8px"></i>${s.business_name}</h3>
          <span style="color:var(--gray-500);font-size:13px">${t('recurring_title')}</span></div>
          <div style="display:flex;gap:8px">
            ${recurringStatusBadge(s.status)}
            ${priorityBadge(s.priority)}
          </div>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px">
            <div>
              <div class="form-label">${t('nav_customers')}</div>
              <div><strong>${s.business_name}</strong></div>
              <div style="font-size:13px;color:var(--gray-500)">${s.contact_name||''}</div>
            </div>
            <div>
              <div class="form-label">${t('order_address')}</div>
              <div>${s.street||'No address'} ${s.street?', '+(s.city||'')+' '+(s.state||'')+' '+(s.zip||''):''}</div>
            </div>
            <div>
              <div class="form-label">${t('recurring_frequency')}</div>
              <div><strong>${frequencyLabel(s.frequency, s.interval_days)}</strong></div>
              ${s.day_of_week !== null && s.day_of_week !== undefined ? `<div style="font-size:12px;color:var(--gray-500)">${DAYS_OF_WEEK[s.day_of_week]}</div>` : ''}
              ${s.day_of_month ? `<div style="font-size:12px;color:var(--gray-500)">${t('recurring_day_of_month')}: ${s.day_of_month}</div>` : ''}
            </div>
            <div>
              <div class="form-label">${t('recurring_next_delivery')}</div>
              <div><strong style="color:#7C3AED">${formatDate(s.next_delivery_date)}</strong></div>
              <div class="form-label" style="margin-top:8px">${t('recurring_last_generated')}</div>
              <div style="font-size:13px">${s.last_generated_date ? formatDate(s.last_generated_date) : '-'}</div>
            </div>
          </div>
          <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
            <div style="padding:8px 14px;background:${s.auto_confirm?'#DCFCE7':'#FEF3C7'};border-radius:8px;font-size:13px">
              <i class="fas ${s.auto_confirm?'fa-check-circle':'fa-hand-paper'}" style="color:${s.auto_confirm?'#16A34A':'#D97706'}"></i>
              ${s.auto_confirm ? t('recurring_auto_confirm') : 'Manual confirmation required'}
            </div>
            <div style="padding:8px 14px;background:#EDE9FE;border-radius:8px;font-size:13px;color:#7C3AED">
              <i class="fas fa-boxes"></i> ${items.length} products per delivery
            </div>
          </div>
          ${s.special_instructions?`<div style="margin-top:16px;padding:12px;background:#FFF7ED;border-radius:8px;border-left:3px solid var(--orange)">
            <strong style="font-size:12px;color:var(--orange)"><i class="fas fa-exclamation-circle"></i> Special Instructions</strong>
            <div style="margin-top:4px;font-size:14px">${s.special_instructions}</div>
          </div>`:''}
          ${s.notes?`<div style="margin-top:12px;padding:12px;background:var(--gray-50);border-radius:8px">
            <strong style="font-size:12px;color:var(--gray-500)"><i class="fas fa-sticky-note"></i> Notes</strong>
            <div style="margin-top:4px;font-size:14px">${s.notes}</div>
          </div>`:''}
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3 class="card-title">${t('recurring_items_template')}</h3><span style="font-size:14px;color:var(--gray-500)">${items.length} items</span></div>
        <div class="table-container">
          <table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Qty</th><th>Unit</th></tr></thead>
          <tbody>${items.map(i => `<tr>
            <td><strong>${i.product_name}</strong></td><td><code style="font-size:12px;color:var(--gray-500)">${i.sku||'-'}</code></td>
            <td>${statusBadge(i.category)}</td><td>${i.quantity}</td>
            <td>${i.unit_type||'bags'}</td>
          </tr>`).join('')}
          </tbody></table>
        </div>
      </div>
      <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
        ${s.status==='active'?`
          <button class="btn btn-success" onclick="generateRecurringOrder(${s.id})"><i class="fas fa-bolt"></i> ${t('recurring_generate')}</button>
          <button class="btn btn-outline" style="color:#D97706;border-color:#D97706" onclick="showSkipRecurringModal(${s.id})"><i class="fas fa-forward"></i> ${t('recurring_skip')}</button>
          <button class="btn btn-outline" style="color:#D97706;border-color:#D97706" onclick="toggleRecurringStatus(${s.id},'paused')"><i class="fas fa-pause-circle"></i> ${t('recurring_pause')}</button>
        `:''}
        ${s.status==='paused'?`
          <button class="btn btn-success" onclick="toggleRecurringStatus(${s.id},'active')"><i class="fas fa-play-circle"></i> ${t('recurring_resume')}</button>
        `:''}
        ${s.status!=='cancelled'?`
          <button class="btn btn-outline" onclick="showEditRecurringModal(${s.id})"><i class="fas fa-edit"></i> ${t('recurring_edit')}</button>
          <button class="btn btn-danger" onclick="toggleRecurringStatus(${s.id},'cancelled')"><i class="fas fa-times-circle"></i> ${t('recurring_cancel')}</button>
        `:''}
        ${archiveActionBtn('recurring_schedules', s.id, s.archived, 'renderRecurring')}
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-history" style="color:var(--gray-500);margin-right:8px"></i>${t('recurring_history')}</h3></div>
        <div class="table-container">
          ${log.length === 0 ? '<div style="text-align:center;padding:24px;color:var(--gray-400)">No history yet</div>' : `
          <table><thead><tr><th>${t('common_date')}</th><th>${t('common_status')}</th><th>Order</th><th>Order Status</th><th>Reason</th></tr></thead>
          <tbody>${log.map(l => `<tr>
            <td>${formatDate(l.scheduled_date)}</td>
            <td>${l.status==='generated'?`<span class="badge badge-success"><i class="fas fa-check"></i> ${t('recurring_generated')}</span>`:`<span class="badge badge-warning"><i class="fas fa-forward"></i> ${t('recurring_skipped')}</span>`}</td>
            <td>${l.order_number?`<a href="#" onclick="event.preventDefault();navigate('orders',{viewId:${l.order_id}})" style="color:var(--navy);font-weight:600">${l.order_number}</a>`:'-'}</td>
            <td>${l.order_status?statusBadge(l.order_status):'-'}</td>
            <td style="font-size:12px;color:var(--gray-500)">${l.skip_reason||''}</td>
          </tr>`).join('')}</tbody></table>`}
        </div>
      </div>`;
  } catch (err) { pc.innerHTML = `<div class="card"><div class="empty-state" style="padding:40px"><p style="color:var(--red)">Error loading schedule</p></div></div>`; }
}

async function showNewRecurringModal() {
  const [custData, prodData] = await Promise.all([API.get('/customers'), API.get('/products')]);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-sync-alt" style="color:#7C3AED;margin-right:8px"></i>${t('recurring_new')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group" style="flex:1"><label class="form-label">Customer *</label>
          <select class="form-select" id="recurCustomer" onchange="loadRecurringAddresses(this.value)">
            <option value="">Select customer...</option>
            ${custData.data.customers.map(c => `<option value="${c.id}">${c.business_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Delivery Address</label>
          <select class="form-select" id="recurAddress"><option value="">Select customer first...</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">${t('recurring_frequency')} *</label>
          <select class="form-select" id="recurFrequency" onchange="toggleRecurringFreqFields()">
            <option value="weekly">${t('recurring_weekly')}</option>
            <option value="biweekly">${t('recurring_biweekly')}</option>
            <option value="monthly">${t('recurring_monthly')}</option>
            <option value="custom">${t('recurring_custom')}</option>
          </select>
        </div>
        <div class="form-group" id="recurDowGroup"><label class="form-label">${t('recurring_day_of_week')}</label>
          <select class="form-select" id="recurDayOfWeek">
            ${DAYS_OF_WEEK.map((d,i) => `<option value="${i}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="recurDomGroup" style="display:none"><label class="form-label">${t('recurring_day_of_month')}</label>
          <input class="form-input" type="number" id="recurDayOfMonth" min="1" max="28" value="1">
        </div>
        <div class="form-group" id="recurIntervalGroup" style="display:none"><label class="form-label">${t('recurring_interval')}</label>
          <input class="form-input" type="number" id="recurInterval" min="1" max="365" value="7">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Priority</label>
          <select class="form-select" id="recurPriority">
            <option value="normal">Normal</option><option value="urgent">Urgent</option><option value="high">High</option><option value="low">Low</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">${t('recurring_next_delivery')} *</label>
          <input class="form-input" type="date" id="recurNextDate">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0">
            <input type="checkbox" id="recurAutoConfirm" style="width:18px;height:18px">
            <span style="font-size:13px">${t('recurring_auto_confirm')}</span>
          </label>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Special Instructions</label><textarea class="form-textarea" id="recurInstructions" rows="2" placeholder="Delivery notes..."></textarea></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="recurNotes" rows="2" placeholder="Internal schedule notes..."></textarea></div>
      <div class="card" style="margin-top:8px">
        <div class="card-header"><h4 class="card-title">${t('recurring_items_template')}</h4>
          <div style="display:flex;gap:6px;align-items:center">
            <select class="form-select" id="recurAddProduct" style="width:250px">
              <option value="">+ Add product...</option>
              ${prodData.data.products.map(p => `<option value="${p.id}" data-name="${p.name}" data-sku="${p.sku}" data-unit="${p.unit_type}">${p.name} (${p.unit_type})</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="recurItemsList" style="padding:12px"><div class="empty-state" style="padding:20px"><p>No items added yet</p></div></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" style="background:#7C3AED" onclick="submitNewRecurring()"><i class="fas fa-check"></i> Create Schedule</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  window._recurItems = [];
  document.getElementById('recurNextDate').value = dayjs().add(1,'day').format('YYYY-MM-DD');
  document.getElementById('recurAddProduct').onchange = function() {
    if (!this.value) return;
    const opt = this.options[this.selectedIndex];
    window._recurItems.push({ product_id: parseInt(this.value), name: opt.dataset.name, sku: opt.dataset.sku, unit: opt.dataset.unit || 'bag', quantity: 1 });
    this.value = '';
    renderRecurItems();
  };
}

function toggleRecurringFreqFields() {
  const freq = document.getElementById('recurFrequency').value;
  document.getElementById('recurDowGroup').style.display = ['weekly','biweekly'].includes(freq) ? '' : 'none';
  document.getElementById('recurDomGroup').style.display = freq === 'monthly' ? '' : 'none';
  document.getElementById('recurIntervalGroup').style.display = freq === 'custom' ? '' : 'none';
}

function renderRecurItems() {
  const el = document.getElementById('recurItemsList');
  if (!el) return;
  if (window._recurItems.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:20px"><p>No items added yet</p></div>';
    return;
  }
  el.innerHTML = `<table><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit</th><th></th></tr></thead><tbody>
    ${window._recurItems.map((item, idx) => {
      return `<tr>
        <td><strong>${item.name}</strong></td>
        <td><code style="font-size:12px">${item.sku||'-'}</code></td>
        <td><input type="number" class="form-input" style="width:70px;text-align:center" value="${item.quantity}" min="1"
          onchange="window._recurItems[${idx}].quantity=parseInt(this.value)||1;renderRecurItems()"></td>
        <td>${item.unit||'bag'}</td>
        <td><button class="btn btn-danger btn-sm" style="padding:2px 6px" onclick="window._recurItems.splice(${idx},1);renderRecurItems()"><i class="fas fa-trash"></i></button></td>
      </tr>`;
    }).join('')}
    <tr style="background:var(--gray-50)"><td colspan="3" style="text-align:right;font-weight:700">Total Items</td><td colspan="2"><strong>${window._recurItems.reduce((s,i)=>s+i.quantity,0)}</strong></td></tr>
  </tbody></table>`;
}

async function loadRecurringAddresses(customerId) {
  const sel = document.getElementById('recurAddress');
  if (!customerId) { sel.innerHTML = '<option value="">Select customer first...</option>'; return; }
  try {
    const { data } = await API.get(`/customers/${customerId}/addresses`);
    const addrs = data.addresses || [];
    sel.innerHTML = '<option value="">No specific address</option>' + addrs.map(a => `<option value="${a.id}" ${a.is_primary?'selected':''}>${a.label} - ${a.street}, ${a.city}</option>`).join('');
  } catch { sel.innerHTML = '<option value="">Error loading addresses</option>'; }
}

async function submitNewRecurring() {
  const customer_id = document.getElementById('recurCustomer').value;
  if (!customer_id) { showToast('Please select a customer', 'warning'); return; }
  if (window._recurItems.length === 0) { showToast('Please add at least one item', 'warning'); return; }
  const nextDate = document.getElementById('recurNextDate').value;
  if (!nextDate) { showToast('Please set the next delivery date', 'warning'); return; }
  const freq = document.getElementById('recurFrequency').value;
  try {
    const { data } = await API.post('/recurring-schedules', {
      customer_id: parseInt(customer_id),
      address_id: parseInt(document.getElementById('recurAddress').value) || null,
      frequency: freq,
      interval_days: freq === 'custom' ? parseInt(document.getElementById('recurInterval').value) || 7 : (freq==='biweekly'?14:freq==='monthly'?30:7),
      day_of_week: ['weekly','biweekly'].includes(freq) ? parseInt(document.getElementById('recurDayOfWeek').value) : null,
      day_of_month: freq === 'monthly' ? parseInt(document.getElementById('recurDayOfMonth').value) : null,
      priority: document.getElementById('recurPriority').value,
      special_instructions: document.getElementById('recurInstructions').value || null,
      notes: document.getElementById('recurNotes').value || null,
      auto_confirm: document.getElementById('recurAutoConfirm').checked ? 1 : 0,
      next_delivery_date: nextDate,
      items: window._recurItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      created_by: currentUser.id,
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Recurring schedule created!', 'success');
    navigate('recurring', { viewId: data.id });
  } catch (err) { showToast('Failed to create schedule', 'error'); }
}

async function showEditRecurringModal(id) {
  const [schedData, custData, prodData] = await Promise.all([
    API.get(`/recurring-schedules/${id}`), API.get('/customers'), API.get('/products')
  ]);
  const s = schedData.data.schedule;
  const existingItems = schedData.data.items || [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-sync-alt" style="color:#7C3AED;margin-right:8px"></i>${t('recurring_edit')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group" style="flex:1"><label class="form-label">Customer</label>
          <select class="form-select" id="recurCustomer" onchange="loadRecurringAddresses(this.value)" disabled>
            ${custData.data.customers.map(c => `<option value="${c.id}" ${c.id===s.customer_id?'selected':''}>${c.business_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Delivery Address</label>
          <select class="form-select" id="recurAddress"><option value="">Loading...</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">${t('recurring_frequency')}</label>
          <select class="form-select" id="recurFrequency" onchange="toggleRecurringFreqFields()">
            <option value="weekly" ${s.frequency==='weekly'?'selected':''}>${t('recurring_weekly')}</option>
            <option value="biweekly" ${s.frequency==='biweekly'?'selected':''}>${t('recurring_biweekly')}</option>
            <option value="monthly" ${s.frequency==='monthly'?'selected':''}>${t('recurring_monthly')}</option>
            <option value="custom" ${s.frequency==='custom'?'selected':''}>${t('recurring_custom')}</option>
          </select>
        </div>
        <div class="form-group" id="recurDowGroup" style="${['weekly','biweekly'].includes(s.frequency)?'':'display:none'}"><label class="form-label">${t('recurring_day_of_week')}</label>
          <select class="form-select" id="recurDayOfWeek">
            ${DAYS_OF_WEEK.map((d,i) => `<option value="${i}" ${i===s.day_of_week?'selected':''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="recurDomGroup" style="${s.frequency==='monthly'?'':'display:none'}"><label class="form-label">${t('recurring_day_of_month')}</label>
          <input class="form-input" type="number" id="recurDayOfMonth" min="1" max="28" value="${s.day_of_month||1}">
        </div>
        <div class="form-group" id="recurIntervalGroup" style="${s.frequency==='custom'?'':'display:none'}"><label class="form-label">${t('recurring_interval')}</label>
          <input class="form-input" type="number" id="recurInterval" min="1" max="365" value="${s.interval_days||7}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Priority</label>
          <select class="form-select" id="recurPriority">
            <option value="urgent" ${s.priority==='urgent'?'selected':''}>Urgent</option><option value="high" ${s.priority==='high'?'selected':''}>High</option>
            <option value="normal" ${s.priority==='normal'?'selected':''}>Normal</option><option value="low" ${s.priority==='low'?'selected':''}>Low</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">${t('recurring_next_delivery')}</label>
          <input class="form-input" type="date" id="recurNextDate" value="${s.next_delivery_date||''}">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0">
            <input type="checkbox" id="recurAutoConfirm" ${s.auto_confirm?'checked':''} style="width:18px;height:18px">
            <span style="font-size:13px">${t('recurring_auto_confirm')}</span>
          </label>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Special Instructions</label><textarea class="form-textarea" id="recurInstructions" rows="2">${s.special_instructions||''}</textarea></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="recurNotes" rows="2">${s.notes||''}</textarea></div>
      <div class="card" style="margin-top:8px">
        <div class="card-header"><h4 class="card-title">${t('recurring_items_template')}</h4>
          <div style="display:flex;gap:6px;align-items:center">
            <select class="form-select" id="recurAddProduct" style="width:250px">
              <option value="">+ Add product...</option>
              ${prodData.data.products.map(p => `<option value="${p.id}" data-name="${p.name}" data-sku="${p.sku}" data-unit="${p.unit_type}">${p.name} (${p.unit_type})</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="recurItemsList" style="padding:12px"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" style="background:#7C3AED" onclick="submitEditRecurring(${id})"><i class="fas fa-save"></i> Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  window._recurItems = existingItems.map(i => ({ product_id: i.product_id, name: i.product_name, sku: i.sku||'', unit: i.unit_type || 'bag', quantity: i.quantity }));
  renderRecurItems();

  // Load addresses for this customer
  loadRecurringAddresses(s.customer_id).then(() => {
    const addrSel = document.getElementById('recurAddress');
    if (addrSel && s.address_id) addrSel.value = s.address_id;
  });

  document.getElementById('recurAddProduct').onchange = function() {
    if (!this.value) return;
    const opt = this.options[this.selectedIndex];
    window._recurItems.push({ product_id: parseInt(this.value), name: opt.dataset.name, sku: opt.dataset.sku, unit: opt.dataset.unit || 'bag', quantity: 1 });
    this.value = '';
    renderRecurItems();
  };
}

async function submitEditRecurring(id) {
  const freq = document.getElementById('recurFrequency').value;
  try {
    await API.put(`/recurring-schedules/${id}`, {
      address_id: parseInt(document.getElementById('recurAddress').value) || null,
      frequency: freq,
      interval_days: freq === 'custom' ? parseInt(document.getElementById('recurInterval').value) || 7 : (freq==='biweekly'?14:freq==='monthly'?30:7),
      day_of_week: ['weekly','biweekly'].includes(freq) ? parseInt(document.getElementById('recurDayOfWeek').value) : null,
      day_of_month: freq === 'monthly' ? parseInt(document.getElementById('recurDayOfMonth').value) : null,
      priority: document.getElementById('recurPriority').value,
      special_instructions: document.getElementById('recurInstructions').value || null,
      notes: document.getElementById('recurNotes').value || null,
      auto_confirm: document.getElementById('recurAutoConfirm').checked ? 1 : 0,
      next_delivery_date: document.getElementById('recurNextDate').value || null,
      items: window._recurItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Schedule updated!', 'success');
    renderRecurringDetail(id);
  } catch (err) { showToast('Failed to update schedule', 'error'); }
}

async function generateRecurringOrder(id) {
  try {
    const { data } = await API.post(`/recurring-schedules/${id}/generate`);
    showToast(`${t('recurring_generated_success')} - ${data.order_number}`, 'success');
    renderRecurringDetail(id);
  } catch (err) { showToast('Failed to generate order', 'error'); }
}

function showSkipRecurringModal(scheduleId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:500px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-forward" style="color:#D97706;margin-right:8px"></i>${t('recurring_skip')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#92400E">
        <i class="fas fa-info-circle"></i> This will skip the next scheduled delivery and move to the following date.
      </div>
      <div class="form-group"><label class="form-label">${t('recurring_skip_reason')}</label>
        <textarea class="form-textarea" id="skipReason" rows="3" placeholder="${t('recurring_skip_reason_placeholder')}"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-warning" onclick="submitSkipRecurring(${scheduleId})"><i class="fas fa-forward"></i> ${t('recurring_skip')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitSkipRecurring(id) {
  const reason = document.getElementById('skipReason')?.value?.trim() || '';
  try {
    await API.post(`/recurring-schedules/${id}/skip`, { reason });
    document.querySelector('.modal-overlay')?.remove();
    showToast(t('recurring_skipped_success'), 'info');
    renderRecurringDetail(id);
  } catch (err) { showToast('Failed to skip', 'error'); }
}

async function toggleRecurringStatus(id, newStatus) {
  try {
    await API.put(`/recurring-schedules/${id}`, { status: newStatus });
    showToast(`Schedule ${newStatus}!`, 'success');
    renderRecurringDetail(id);
  } catch (err) { showToast('Failed to update status', 'error'); }
}

async function generateAllDue() {
  try {
    const { data } = await API.post('/recurring-schedules/generate-due');
    if (data.count === 0) {
      showToast('No schedules due for generation', 'info');
    } else {
      showToast(`Generated ${data.count} order(s)!`, 'success');
    }
    renderRecurring();
  } catch (err) { showToast('Failed to generate orders', 'error'); }
}

// Make Recurring from existing order
async function showMakeRecurringModal(orderId, customerId, addressId, priority, instructions) {
  const { data: orderData } = await API.get(`/orders/${orderId}`);
  const items = orderData.items || [];
  const prodData = await API.get('/products');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-sync-alt" style="color:#7C3AED;margin-right:8px"></i>${t('recurring_make_recurring')} - ${orderData.order.order_number}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div style="background:#EDE9FE;border:1px solid #D8B4FE;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#6D28D9">
        <i class="fas fa-info-circle"></i> This will create a recurring schedule based on order ${orderData.order.order_number}'s items. Future orders will be auto-generated on the schedule.
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">${t('recurring_frequency')} *</label>
          <select class="form-select" id="recurFrequency" onchange="toggleRecurringFreqFields()">
            <option value="weekly">${t('recurring_weekly')}</option>
            <option value="biweekly">${t('recurring_biweekly')}</option>
            <option value="monthly">${t('recurring_monthly')}</option>
            <option value="custom">${t('recurring_custom')}</option>
          </select>
        </div>
        <div class="form-group" id="recurDowGroup"><label class="form-label">${t('recurring_day_of_week')}</label>
          <select class="form-select" id="recurDayOfWeek">
            ${DAYS_OF_WEEK.map((d,i) => `<option value="${i}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="recurDomGroup" style="display:none"><label class="form-label">${t('recurring_day_of_month')}</label>
          <input class="form-input" type="number" id="recurDayOfMonth" min="1" max="28" value="1">
        </div>
        <div class="form-group" id="recurIntervalGroup" style="display:none"><label class="form-label">${t('recurring_interval')}</label>
          <input class="form-input" type="number" id="recurInterval" min="1" max="365" value="7">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">${t('recurring_next_delivery')} *</label>
          <input class="form-input" type="date" id="recurNextDate">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0">
            <input type="checkbox" id="recurAutoConfirm" style="width:18px;height:18px">
            <span style="font-size:13px">${t('recurring_auto_confirm')}</span>
          </label>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="recurNotes" rows="2" placeholder="Internal schedule notes..."></textarea></div>
      <div class="card" style="margin-top:8px">
        <div class="card-header"><h4 class="card-title">${t('recurring_items_template')}</h4>
          <span style="font-size:12px;color:var(--gray-500)">Copied from order</span>
        </div>
        <div id="recurItemsList" style="padding:12px"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" style="background:#7C3AED" onclick="submitMakeRecurring(${orderId},${customerId},${addressId || 'null'},'${priority}')"><i class="fas fa-sync-alt"></i> Create Recurring Schedule</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  window._recurItems = items.map(i => ({ product_id: i.product_id, name: i.product_name, sku: i.sku||'', unit: i.unit_type || 'bag', quantity: i.quantity }));
  renderRecurItems();
  document.getElementById('recurNextDate').value = dayjs().add(7,'day').format('YYYY-MM-DD');
}

async function submitMakeRecurring(orderId, customerId, addressId, priority) {
  const nextDate = document.getElementById('recurNextDate').value;
  if (!nextDate) { showToast('Please set the next delivery date', 'warning'); return; }
  if (window._recurItems.length === 0) { showToast('No items in the schedule', 'warning'); return; }
  const freq = document.getElementById('recurFrequency').value;
  try {
    const { data } = await API.post('/recurring-schedules', {
      customer_id: customerId,
      address_id: addressId,
      frequency: freq,
      interval_days: freq === 'custom' ? parseInt(document.getElementById('recurInterval').value) || 7 : (freq==='biweekly'?14:freq==='monthly'?30:7),
      day_of_week: ['weekly','biweekly'].includes(freq) ? parseInt(document.getElementById('recurDayOfWeek').value) : null,
      day_of_month: freq === 'monthly' ? parseInt(document.getElementById('recurDayOfMonth').value) : null,
      priority: priority,
      notes: document.getElementById('recurNotes').value || null,
      auto_confirm: document.getElementById('recurAutoConfirm').checked ? 1 : 0,
      next_delivery_date: nextDate,
      items: window._recurItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      created_by: currentUser.id,
    });
    // Link the original order to the new schedule
    await API.put(`/orders/${orderId}`, { recurring_schedule_id: data.id });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Recurring schedule created!', 'success');
    navigate('recurring', { viewId: data.id });
  } catch (err) { showToast('Failed to create recurring schedule', 'error'); }
}

// ==================== HOLD ORDER FUNCTIONS ====================
function showHoldOrderModal(orderId, currentStatus) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:500px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-pause-circle" style="color:#A855F7"></i> ${t('hold_title')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div style="background:#FDF4FF;border:1px solid #E9D5FF;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#7C3AED">
        <i class="fas fa-info-circle"></i> ${t('hold_recurring')}
      </div>
      <div class="form-group"><label class="form-label">${t('hold_reason')}</label>
        <textarea class="form-textarea" id="holdReason" rows="3" placeholder="${t('hold_reason_placeholder')}"></textarea>
      </div>
      <input type="hidden" id="holdPreviousStatus" value="${currentStatus}">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" style="background:#A855F7" onclick="submitHoldOrder(${orderId})"><i class="fas fa-pause-circle"></i> ${t('hold_put')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitHoldOrder(orderId) {
  const reason = document.getElementById('holdReason')?.value?.trim() || '';
  try {
    await API.patch(`/orders/${orderId}/hold`, { action: 'hold', hold_reason: reason });
    document.querySelector('.modal-overlay')?.remove();
    showToast(t('hold_placed'), 'info');
    navigate('orders', { viewId: orderId });
  } catch (err) { showToast('Failed to hold order', 'error'); }
}

async function releaseOrderHold(orderId) {
  try {
    await API.patch(`/orders/${orderId}/hold`, { action: 'release', restore_status: 'confirmed' });
    showToast(t('hold_released'));
    navigate('orders', { viewId: orderId });
  } catch (err) { showToast('Failed to release hold', 'error'); }
}

// ==================== STREET VIEW FUNCTIONS ====================
function toggleOrderStreetView(lat, lng, mapContainerId, streetViewContainerId) {
  const mapEl = document.getElementById(mapContainerId);
  const svEl = document.getElementById(streetViewContainerId);
  if (!svEl || !mapEl) return;
  if (svEl.style.display === 'none') {
    // Show street view, hide map
    svEl.style.display = 'block';
    mapEl.style.display = 'none';
    const iframe = svEl.querySelector('iframe');
    if (iframe) {
      iframe.src = `https://www.google.com/maps/embed?pb=!4v${Date.now()}!6m8!1m7!1s!2m2!1d${lat}!2d${lng}!3f0!4f0!5f0.7820865974627469&maptype=streetview&fov=90&heading=0&pitch=0`;
      // Fallback: use Google Maps street view URL
      iframe.src = `https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t/data=!3m7!1e1!3m5!1s!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2F!7i16384!8i8192?entry=ttu`;
    }
    // Change button text
    const btn = document.querySelector(`[onclick*="toggleOrderStreetView"]`);
    if (btn) { btn.innerHTML = `<i class="fas fa-map" style="color:var(--navy-light)"></i> Map View`; }
  } else {
    // Show map, hide street view
    svEl.style.display = 'none';
    mapEl.style.display = 'block';
    const iframe = svEl.querySelector('iframe');
    if (iframe) iframe.src = '';
    // Invalidate map size
    if (window._orderMap) setTimeout(() => window._orderMap.invalidateSize(), 100);
    const btn = document.querySelector(`[onclick*="toggleOrderStreetView"]`);
    if (btn) { btn.innerHTML = `<i class="fas fa-street-view" style="color:var(--green)"></i> ${t('street_view')}`; }
  }
}

function openStreetView(lat, lng, title) {
  if (!lat || !lng) { showToast(t('street_view_na'), 'warning'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal modal-lg" style="max-width:900px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-street-view" style="color:var(--green)"></i> ${t('street_view')} - ${title || 'Location'}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body" style="padding:0">
      <div class="streetview-container" style="height:500px;border-radius:0 0 16px 16px">
        <iframe src="https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t/data=!3m7!1e1!3m5!1s!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2F!7i16384!8i8192?entry=ttu" allowfullscreen style="width:100%;height:100%;border:none"></iframe>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

// Google Maps Street View embed for route stops
function showStopStreetView(lat, lng, businessName) {
  if (!lat || !lng) { showToast(t('street_view_na'), 'warning'); return; }
  openStreetView(lat, lng, businessName);
}

// ==================== DRIVER-TRUCK ASSIGNMENT FUNCTIONS ====================
async function showDriverTruckAssignments(driverId) {
  const [assignRes, trucksRes] = await Promise.all([
    API.get(`/driver-truck-assignments?driver_id=${driverId}`),
    API.get('/trucks')
  ]);
  const assignments = assignRes.data.assignments || [];
  const allTrucks = trucksRes.data.trucks || [];
  const assignedIds = assignments.map(a => a.truck_id);
  const availTrucks = allTrucks.filter(tk => !assignedIds.includes(tk.id));

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'driverTruckModal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:600px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-truck" style="color:var(--navy-light)"></i> ${t('assign_trucks')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div id="driverTruckList" style="margin-bottom:16px">
        ${assignments.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--gray-400)"><i class="fas fa-truck" style="font-size:24px;margin-bottom:8px"></i><div>${t('assign_no_trucks')}</div></div>` :
          `<div style="display:flex;flex-wrap:wrap;gap:8px">${assignments.map(a => `
            <span class="truck-assignment-pill ${a.is_primary ? 'primary' : ''}">
              <i class="fas fa-truck" style="font-size:10px"></i> ${a.truck_name} ${a.plate_number ? '('+a.plate_number+')' : ''}
              ${a.is_primary ? '<i class="fas fa-star" style="color:#F59E0B;font-size:10px" title="Primary"></i>' : `<button onclick="event.stopPropagation();setDriverTruckPrimary(${a.id},${driverId})" title="${t('assign_set_primary')}" style="color:#F59E0B"><i class="fas fa-star"></i></button>`}
              <button onclick="event.stopPropagation();removeDriverTruck(${a.id},${driverId})" title="Remove">&times;</button>
            </span>`).join('')}</div>`}
      </div>
      ${availTrucks.length > 0 ? `
      <div style="border-top:1px solid var(--gray-200);padding-top:16px">
        <div class="form-label">${t('assign_add_truck')}</div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="assignTruckSelect" style="flex:1">
            ${availTrucks.map(tk => `<option value="${tk.id}">${tk.name} ${tk.plate_number ? '('+tk.plate_number+')' : ''} — ${tk.max_pallet_spots||12} pallets</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="addDriverTruck(${driverId})"><i class="fas fa-plus"></i></button>
        </div>
      </div>` : '<div style="font-size:12px;color:var(--gray-400);margin-top:8px">All trucks are already assigned to this driver</div>'}
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function addDriverTruck(driverId) {
  const truckId = parseInt(document.getElementById('assignTruckSelect')?.value);
  if (!truckId) return;
  try {
    await API.post('/driver-truck-assignments', { driver_id: driverId, truck_id: truckId, is_primary: 0 });
    document.querySelector('#driverTruckModal')?.remove();
    showToast(t('route_assigned'));
    showDriverTruckAssignments(driverId);
  } catch (err) { showToast(err.response?.data?.error || 'Failed to assign', 'error'); }
}

async function removeDriverTruck(assignmentId, driverId) {
  if (!confirm('Remove this truck assignment?')) return;
  try {
    await API.delete(`/driver-truck-assignments/${assignmentId}`);
    document.querySelector('#driverTruckModal')?.remove();
    showDriverTruckAssignments(driverId);
  } catch (err) { showToast('Failed to remove', 'error'); }
}

async function setDriverTruckPrimary(assignmentId, driverId) {
  try {
    await API.put(`/driver-truck-assignments/${assignmentId}/primary`);
    document.querySelector('#driverTruckModal')?.remove();
    showDriverTruckAssignments(driverId);
  } catch (err) { showToast('Failed to update', 'error'); }
}

// ==================== ROUTE DRIVER/TRUCK ASSIGNMENT ====================
async function showAssignDriverToRoute(routeId, currentDriverId) {
  const [driversRes, assignmentsRes] = await Promise.all([
    API.get('/drivers'),
    API.get('/driver-truck-assignments')
  ]);
  const drivers = driversRes.data.drivers || [];
  const allAssignments = assignmentsRes.data.assignments || [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:500px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-user" style="color:var(--navy-light)"></i> ${t('route_assign_driver')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">${t('packing_driver')}</label>
        <select class="form-select" id="routeAssignDriver">
          <option value="">-- Select Driver --</option>
          ${drivers.map(d => {
            const driverTrucks = allAssignments.filter(a => a.driver_id === d.id);
            const truckNames = driverTrucks.map(a => a.truck_name).join(', ');
            return `<option value="${d.id}" ${d.id === currentDriverId ? 'selected' : ''}>${d.name}${truckNames ? ' (Trucks: ' + truckNames + ')' : ''}</option>`;
          }).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitAssignDriver(${routeId})"><i class="fas fa-check"></i> ${t('route_assign_driver')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitAssignDriver(routeId) {
  const driverId = parseInt(document.getElementById('routeAssignDriver')?.value) || null;
  try {
    await API.put(`/routes/${routeId}`, { driver_id: driverId });
    document.querySelector('.modal-overlay')?.remove();
    showToast(t('route_assigned'));
    navigate('routes', { viewId: routeId });
  } catch (err) { showToast('Failed to assign driver', 'error'); }
}

async function showAssignTruckToRoute(routeId, currentTruckId, currentDriverId) {
  const [trucksRes, assignmentsRes] = await Promise.all([
    API.get('/trucks'),
    currentDriverId ? API.get(`/driver-truck-assignments?driver_id=${currentDriverId}`) : Promise.resolve({ data: { assignments: [] } })
  ]);
  const allTrucks = trucksRes.data.trucks || [];
  const driverAssignments = assignmentsRes.data.assignments || [];
  const driverTruckIds = driverAssignments.map(a => a.truck_id);
  const hasDriverTrucks = driverTruckIds.length > 0;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:500px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-truck" style="color:var(--navy-light)"></i> ${t('route_assign_truck')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      ${hasDriverTrucks ? `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#1E40AF"><i class="fas fa-info-circle"></i> ${t('route_driver_trucks_only')}</div>` : ''}
      <div class="form-group"><label class="form-label">${t('packing_truck')}</label>
        <select class="form-select" id="routeAssignTruck">
          <option value="">-- Select Truck --</option>
          ${hasDriverTrucks ? `<optgroup label="Driver's Trucks">
            ${allTrucks.filter(tk => driverTruckIds.includes(tk.id)).map(tk => `<option value="${tk.id}" ${tk.id === currentTruckId ? 'selected' : ''}>${tk.name} ${tk.plate_number ? '('+tk.plate_number+')' : ''} — ${tk.max_pallet_spots||12} pallets</option>`).join('')}
          </optgroup>
          <optgroup label="Other Trucks">
            ${allTrucks.filter(tk => !driverTruckIds.includes(tk.id)).map(tk => `<option value="${tk.id}" ${tk.id === currentTruckId ? 'selected' : ''}>${tk.name} ${tk.plate_number ? '('+tk.plate_number+')' : ''} — ${tk.max_pallet_spots||12} pallets</option>`).join('')}
          </optgroup>` :
          allTrucks.map(tk => `<option value="${tk.id}" ${tk.id === currentTruckId ? 'selected' : ''}>${tk.name} ${tk.plate_number ? '('+tk.plate_number+')' : ''} — ${tk.max_pallet_spots||12} pallets</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">${t('common_cancel')}</button>
      <button class="btn btn-primary" onclick="submitAssignTruck(${routeId})"><i class="fas fa-check"></i> ${t('route_assign_truck')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function submitAssignTruck(routeId) {
  const truckId = parseInt(document.getElementById('routeAssignTruck')?.value) || null;
  try {
    await API.put(`/routes/${routeId}`, { truck_id: truckId });
    document.querySelector('.modal-overlay')?.remove();
    showToast(t('route_assigned'));
    navigate('routes', { viewId: routeId });
  } catch (err) { showToast('Failed to assign truck', 'error'); }
}

// ==================== ROUTE STATUS MANAGEMENT ====================
function routeStatusLabel(s) {
  const labels = {
    planned: 'Planned',
    pending_loading: 'Pending Loading',
    loaded: 'Loaded',
    truck_left: 'Truck Left',
    dispatched: 'Dispatched',
    in_transit: 'In Transit',
    delivered: 'Delivered',
    completed: 'Completed'
  };
  return labels[s] || s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function updateRouteStatus(routeId, newStatus) {
  try {
    await API.put(`/routes/${routeId}`, { status: newStatus });
    showToast(`Route status updated to ${routeStatusLabel(newStatus)}`);
    renderRouteDetail(routeId);
  } catch (err) { showToast('Failed to update route status', 'error'); }
}

// ==================== ROUTE RENAMING ====================
function showRenameRouteModal(routeId, currentName) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:420px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-pen" style="color:var(--navy-light)"></i> Rename Route</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Route Name / Number</label>
        <input class="form-input" id="renameRouteInput" value="${escapeHtml(currentName)}" placeholder="e.g. RT-0409-NORTH or Monday Palm Beach" style="font-weight:600;font-size:15px">
      </div>
      <div style="font-size:12px;color:var(--gray-400)"><i class="fas fa-info-circle"></i> You can use any name: route numbers, zone names, or custom labels.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitRenameRoute(${routeId})"><i class="fas fa-check"></i> Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  setTimeout(() => { const inp = document.getElementById('renameRouteInput'); if (inp) { inp.focus(); inp.select(); } }, 100);
}

function showChangeDateModal(routeId, currentDate) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:420px">
    <div class="modal-header"><h3 class="modal-title"><i class="fas fa-calendar-day" style="color:var(--navy-light)"></i> Change Route Date</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Route Date</label>
        <input class="form-input" type="date" id="changeDateInput" value="${currentDate}" style="font-weight:600;font-size:15px">
      </div>
      <div style="font-size:12px;color:var(--gray-400)"><i class="fas fa-info-circle"></i> This will also update the scheduled date on all orders assigned to this route.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitChangeDate(${routeId})"><i class="fas fa-check"></i> Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  setTimeout(() => { const inp = document.getElementById('changeDateInput'); if (inp) inp.focus(); }, 100);
}

async function submitChangeDate(routeId) {
  const newDate = document.getElementById('changeDateInput')?.value;
  if (!newDate) { showToast('Please select a date', 'warning'); return; }
  try {
    await API.put(`/routes/${routeId}`, { date: newDate });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Route date updated!');
    renderRouteDetail(routeId);
  } catch (err) { showToast('Failed to update date', 'error'); }
}

async function submitRenameRoute(routeId) {
  const name = document.getElementById('renameRouteInput')?.value?.trim();
  if (!name) { showToast('Route name cannot be empty', 'warning'); return; }
  try {
    await API.put(`/routes/${routeId}`, { route_number: name });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Route renamed!');
    renderRouteDetail(routeId);
  } catch (err) { showToast('Failed to rename route', 'error'); }
}

// ==================== RETURNS SYSTEM ====================
async function showReturnModal(orderId, routeId, customerId) {
  // Load products and customer info
  try {
    const [productsRes, customersRes] = await Promise.all([
      API.get('/products'),
      customerId ? API.get(`/customers/${customerId}`) : Promise.resolve({ data: { customer: null } })
    ]);
    const products = productsRes.data.products || [];
    const customer = customersRes.data.customer;

    // If orderId is provided, get order items to pre-populate
    let orderItems = [];
    if (orderId) {
      try {
        const { data: od } = await API.get(`/orders/${orderId}`);
        orderItems = od.items || [];
      } catch (e) {}
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '10001';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal modal-lg" style="max-width:700px">
      <div class="modal-header" style="background:linear-gradient(135deg,#EDE9FE,#DDD6FE);border-bottom:2px solid #7C3AED">
        <h3 class="modal-title"><i class="fas fa-rotate-left" style="color:#7C3AED"></i> Log Return${customer ? ' — ' + customer.business_name : ''}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        ${!customerId ? `<div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Customer</label>
          <select class="form-select" id="returnCustomerId">
            <option value="">-- Select Customer --</option>
          </select>
        </div>` : `<input type="hidden" id="returnCustomerId" value="${customerId}">`}
        <input type="hidden" id="returnOrderId" value="${orderId||''}">
        <input type="hidden" id="returnRouteId" value="${routeId||''}">

        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label class="form-label" style="margin:0">Return Items</label>
            <button class="btn btn-outline btn-sm" onclick="addReturnItemRow()"><i class="fas fa-plus"></i> Add Item</button>
          </div>
          <div id="returnItemsContainer">
            <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:4px;padding:6px 8px;background:var(--gray-50);border-radius:8px;font-size:11px;font-weight:600;color:var(--gray-500)">
              <div>Product</div><div>Expected</div><div>Actual</div><div>Reason</div><div></div>
            </div>
            ${orderItems.length > 0 ? orderItems.map((it, i) => returnItemRowHtml(i, products, it.product_id, 0, 0, '')).join('') : returnItemRowHtml(0, products, '', 0, 0, '')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="returnNotes" rows="2" placeholder="Any additional return details..."></textarea>
        </div>

        <div style="font-size:12px;color:var(--gray-400);padding:8px 0;display:flex;align-items:center;gap:6px">
          <i class="fas fa-info-circle"></i>
          <span><strong>Expected</strong> = what dispatch/office expects to come back. <strong>Actual</strong> = what driver physically brings back. Drivers can fill Actual; dispatch fills Expected.</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:600" onclick="submitReturn()"><i class="fas fa-check"></i> Submit Return</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    // If no customerId, load customer list
    if (!customerId) {
      const { data: custData } = await API.get('/customers');
      const sel = document.getElementById('returnCustomerId');
      if (sel) {
        (custData.customers||[]).forEach(c => {
          sel.innerHTML += `<option value="${c.id}">${c.business_name}</option>`;
        });
      }
    }
  } catch (err) {
    showToast('Failed to load return form: ' + (err.message || err), 'error');
  }
}

window._returnItemCounter = 0;
function returnItemRowHtml(idx, products, selectedProductId, expectedQty, actualQty, reason) {
  const id = window._returnItemCounter++;
  return `<div class="return-item-row" data-idx="${id}" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:4px;align-items:center">
    <select class="form-select" style="font-size:12px;padding:6px 8px" data-field="product_id">
      <option value="">-- Product --</option>
      ${products.map(p => `<option value="${p.id}" ${p.id==selectedProductId?'selected':''}>${p.name} ${p.sku?'('+p.sku+')':''}</option>`).join('')}
    </select>
    <input class="form-input" type="number" min="0" value="${expectedQty}" data-field="expected_qty" placeholder="0" style="font-size:12px;padding:6px 8px;text-align:center">
    <input class="form-input" type="number" min="0" value="${actualQty}" data-field="actual_qty" placeholder="0" style="font-size:12px;padding:6px 8px;text-align:center">
    <select class="form-select" style="font-size:11px;padding:6px 4px" data-field="reason">
      <option value="">—</option>
      <option value="damaged" ${reason==='damaged'?'selected':''}>Damaged</option>
      <option value="wrong_item" ${reason==='wrong_item'?'selected':''}>Wrong Item</option>
      <option value="overstock" ${reason==='overstock'?'selected':''}>Overstock</option>
      <option value="refused" ${reason==='refused'?'selected':''}>Refused</option>
      <option value="expired" ${reason==='expired'?'selected':''}>Expired</option>
      <option value="other" ${reason==='other'?'selected':''}>Other</option>
    </select>
    <button class="btn-icon" onclick="this.closest('.return-item-row').remove()" title="Remove"><i class="fas fa-times" style="color:var(--red)"></i></button>
  </div>`;
}

async function addReturnItemRow() {
  const container = document.getElementById('returnItemsContainer');
  if (!container) return;
  try {
    const { data } = await API.get('/products');
    container.insertAdjacentHTML('beforeend', returnItemRowHtml(window._returnItemCounter, data.products || [], '', 0, 0, ''));
  } catch (e) {}
}

async function submitReturn() {
  const customerId = parseInt(document.getElementById('returnCustomerId')?.value);
  const orderId = parseInt(document.getElementById('returnOrderId')?.value) || null;
  const routeId = parseInt(document.getElementById('returnRouteId')?.value) || null;
  const notes = document.getElementById('returnNotes')?.value || '';

  if (!customerId) { showToast('Please select a customer', 'warning'); return; }

  const rows = document.querySelectorAll('.return-item-row');
  const items = [];
  rows.forEach(row => {
    const productId = parseInt(row.querySelector('[data-field="product_id"]')?.value);
    const expectedQty = parseInt(row.querySelector('[data-field="expected_qty"]')?.value) || 0;
    const actualQty = parseInt(row.querySelector('[data-field="actual_qty"]')?.value) || 0;
    const reason = row.querySelector('[data-field="reason"]')?.value || '';
    if (productId && (expectedQty > 0 || actualQty > 0)) {
      items.push({ product_id: productId, expected_qty: expectedQty, actual_qty: actualQty, reason });
    }
  });

  if (items.length === 0) { showToast('Add at least one return item with a quantity', 'warning'); return; }

  try {
    const createdBy = currentUser?.id || null;
    await API.post('/returns', {
      order_id: orderId, route_id: routeId, customer_id: customerId,
      created_by: createdBy, status: 'pending', notes, items
    });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Return logged successfully!', 'success');
  } catch (err) {
    showToast('Failed to submit return: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// ==================== ENHANCED ORDER EDITING (with items) ====================
async function showEditOrderModal(orderId) {
  try {
    const [orderRes, productsRes] = await Promise.all([
      API.get(`/orders/${orderId}`),
      API.get('/products')
    ]);
    const o = orderRes.data.order;
    const items = orderRes.data.items || [];
    const products = productsRes.data.products || [];
    const isOnRoute = ['scheduled','in_transit','loaded'].includes(o.status);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal modal-lg" style="max-width:750px">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fas fa-pen" style="color:var(--navy-light)"></i> Edit ${o.order_number}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        ${isOnRoute ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#92400E"><i class="fas fa-exclamation-triangle"></i> This order is on a route (status: <strong>${o.status}</strong>). Changes will update the route totals automatically.</div>` : ''}
        <div class="form-row">
          <div class="form-group"><label class="form-label">Order #</label><input class="form-input" id="editOrderNumber" value="${o.order_number||''}" style="font-family:monospace;font-weight:600"></div>
          <div class="form-group"><label class="form-label">Priority</label>
            <select class="form-select" id="editOrderPriority"><option value="urgent" ${o.priority==='urgent'?'selected':''}>Urgent</option><option value="high" ${o.priority==='high'?'selected':''}>High</option><option value="normal" ${o.priority==='normal'?'selected':''}>Normal</option><option value="low" ${o.priority==='low'?'selected':''}>Low</option></select>
          </div>
          <div class="form-group"><label class="form-label">Scheduled Date</label><input class="form-input" type="date" id="editOrderDate" value="${o.scheduled_date||''}"></div>
        </div>
        <div class="form-group"><label class="form-label">Special Instructions</label><textarea class="form-textarea" id="editOrderInstructions">${o.special_instructions||''}</textarea></div>

        <div style="border-top:1px solid var(--gray-200);margin-top:12px;padding-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label class="form-label" style="margin:0;font-size:14px;font-weight:700"><i class="fas fa-boxes-stacked" style="color:var(--navy-light)"></i> Order Items</label>
            <button class="btn btn-outline btn-sm" onclick="addEditOrderItemRow()"><i class="fas fa-plus"></i> Add Item</button>
          </div>
          <div id="editOrderItemsContainer">
            <div style="display:grid;grid-template-columns:2.5fr 1fr auto;gap:6px;margin-bottom:4px;padding:4px 8px;background:var(--gray-50);border-radius:8px;font-size:11px;font-weight:600;color:var(--gray-500)">
              <div>Product</div><div>Quantity</div><div></div>
            </div>
            ${items.map((it, i) => editOrderItemRowHtml(products, it.product_id, it.quantity)).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditOrder(${orderId})"><i class="fas fa-save"></i> Save Changes</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    // Store products for adding rows
    window._editOrderProducts = products;
  } catch (err) {
    showToast('Failed to load order: ' + (err.message || err), 'error');
  }
}

function editOrderItemRowHtml(products, selectedProductId, quantity) {
  return `<div class="edit-order-item-row" style="display:grid;grid-template-columns:2.5fr 1fr auto;gap:6px;margin-bottom:4px;align-items:center">
    <select class="form-select" style="font-size:12px;padding:6px 8px" data-field="product_id">
      <option value="">-- Select Product --</option>
      ${products.map(p => `<option value="${p.id}" ${p.id==selectedProductId?'selected':''}>${p.name} ${p.sku?'('+p.sku+')':''}</option>`).join('')}
    </select>
    <input class="form-input" type="number" min="1" value="${quantity||1}" data-field="quantity" style="font-size:12px;padding:6px 8px;text-align:center;font-weight:600">
    <button class="btn-icon" onclick="this.closest('.edit-order-item-row').remove()" title="Remove"><i class="fas fa-times" style="color:var(--red)"></i></button>
  </div>`;
}

function addEditOrderItemRow() {
  const container = document.getElementById('editOrderItemsContainer');
  if (!container) return;
  const products = window._editOrderProducts || [];
  container.insertAdjacentHTML('beforeend', editOrderItemRowHtml(products, '', 1));
}

async function submitEditOrder(id) {
  try {
    // Gather items
    const rows = document.querySelectorAll('.edit-order-item-row');
    const items = [];
    rows.forEach(row => {
      const productId = parseInt(row.querySelector('[data-field="product_id"]')?.value);
      const quantity = parseInt(row.querySelector('[data-field="quantity"]')?.value) || 0;
      if (productId && quantity > 0) {
        items.push({ product_id: productId, quantity });
      }
    });

    const payload = {
      order_number: document.getElementById('editOrderNumber')?.value?.trim() || undefined,
      priority: document.getElementById('editOrderPriority')?.value,
      scheduled_date: document.getElementById('editOrderDate')?.value || null,
      special_instructions: document.getElementById('editOrderInstructions')?.value,
    };
    if (items.length > 0) {
      payload.items = items;
    }

    await API.put(`/orders/${id}`, payload);
    document.querySelector('.modal-overlay')?.remove();
    showToast('Order updated!');
    // Refresh whichever view is active
    if (window._currentRouteId) {
      renderRouteDetail(window._currentRouteId);
    } else {
      try { renderOrderDetail(id); } catch (e) { renderOrders(); }
    }
  } catch (err) { showToast('Failed to update: ' + (err.response?.data?.error || err.message), 'error'); }
}

// Driver return button - add to driver stop actions
async function showDriverReturnModal(orderId, routeId, customerId) {
  showReturnModal(orderId, routeId, customerId);
}

// ==================== RETURNS PAGE ====================
async function renderReturns() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i></div>';
  try {
    const { data } = await API.get('/returns');
    const returns = data.returns || [];

    // Summary stats
    const pending = returns.filter(r => r.status === 'pending' || r.status === 'approved');
    const received = returns.filter(r => r.status === 'received');
    const processed = returns.filter(r => r.status === 'processed');
    const needsReceive = returns.filter(r => r.status === 'pending' || r.status === 'approved');

    pc.innerHTML = `
      <div class="filters-bar no-print" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700" onclick="showReturnModal()"><i class="fas fa-plus"></i> New Return</button>
          <div style="display:flex;gap:6px;font-size:12px">
            <span style="padding:4px 10px;border-radius:12px;background:#FFFBEB;color:#CA8A04;font-weight:600">${pending.length} Pending</span>
            <span style="padding:4px 10px;border-radius:12px;background:#F0E6FF;color:#7C3AED;font-weight:600">${received.length} Received</span>
            <span style="padding:4px 10px;border-radius:12px;background:#ECFDF5;color:#059669;font-weight:600">${processed.length} Processed</span>
          </div>
        </div>
        <select class="form-select" style="width:auto;font-size:12px;padding:6px 10px" id="returnStatusFilter" onchange="filterReturnsTable()">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="received">Received</option>
          <option value="processed">Processed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      ${needsReceive.length > 0 ? `
      <div style="padding:12px 16px;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:1px solid #F59E0B;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <i class="fas fa-inbox" style="font-size:20px;color:#D97706"></i>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px;color:#92400E">${needsReceive.length} return${needsReceive.length > 1 ? 's' : ''} awaiting warehouse receipt</div>
          <div style="font-size:11px;color:#A16207">Click a return row or the <strong>Receive</strong> button to inspect items and mark as received.</div>
        </div>
      </div>` : ''}

      ${returns.length > 0 ? `
      <div class="card">
        <div class="table-container">
          <table><thead><tr>
            <th>ID</th><th>Customer</th><th>Order</th><th>Route</th><th>Items</th><th>Expected</th><th>Actual</th><th>Status</th><th>Created</th><th>Date</th><th style="text-align:center">Actions</th>
          </tr></thead>
          <tbody id="returnsTableBody">
            ${returns.map(r => {
              const totalExpected = (r.items||[]).reduce((s,i) => s + (i.expected_qty||0), 0);
              const totalActual = (r.items||[]).reduce((s,i) => s + (i.actual_qty||0), 0);
              const mismatch = totalExpected > 0 && totalActual > 0 && totalExpected !== totalActual;
              const canReceive = r.status === 'pending' || r.status === 'approved';
              const isReceived = r.status === 'received';
              return `<tr onclick="showReturnDetail(${r.id})" style="cursor:pointer" data-status="${r.status}">
                <td><strong style="color:#7C3AED">#${r.id}</strong></td>
                <td>${r.business_name||'—'}</td>
                <td>${r.order_number||'—'}</td>
                <td>${r.route_number||'—'}</td>
                <td><span class="badge badge-normal">${(r.items||[]).length} items</span></td>
                <td style="font-weight:600;color:var(--navy)">${totalExpected}</td>
                <td style="font-weight:600;color:${mismatch?'#DC2626':'var(--navy)'}">${totalActual} ${mismatch?'<i class="fas fa-exclamation-triangle" style="color:#D97706;font-size:10px"></i>':''}</td>
                <td>${statusBadge(r.status)}</td>
                <td style="font-size:12px;color:var(--gray-500)">${r.created_by_name||'—'}</td>
                <td style="font-size:12px;color:var(--gray-500)">${formatDate(r.created_at)}</td>
                <td style="text-align:center" onclick="event.stopPropagation()">
                  <div style="display:flex;gap:4px;justify-content:center">
                    <button class="btn-icon" onclick="showEditReturnModal(${r.id})" title="Edit return" style="background:#2563EB;color:white;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center"><i class="fas fa-pen" style="font-size:11px;color:white"></i></button>
                    <button class="btn-icon" onclick="showReceiveReturnModal(${r.id})" title="Receive return" style="background:#7C3AED;color:white;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center"><i class="fas fa-clipboard-check" style="font-size:11px;color:white"></i></button>
                    ${isReceived ? `<button class="btn-icon" onclick="markReturnProcessed(${r.id})" title="Mark processed" style="background:#059669;color:white;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center"><i class="fas fa-check-double" style="font-size:11px;color:white"></i></button>` : ''}
                    <button class="btn-icon" onclick="deleteReturn(${r.id})" title="Delete"><i class="fas fa-trash" style="color:var(--red)"></i></button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody></table>
        </div>
      </div>` : `<div class="empty-state" style="padding:60px"><i class="fas fa-rotate-left" style="font-size:48px;color:var(--gray-300)"></i><h3>No returns yet</h3><p>Returns will appear here when logged by drivers, dispatch, or warehouse staff.</p></div>`}
    `;
  } catch (err) {
    pc.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Failed to load returns</h3><p>${err.message}</p></div>`;
  }
}

function filterReturnsTable() {
  const filter = document.getElementById('returnStatusFilter')?.value || 'all';
  const rows = document.querySelectorAll('#returnsTableBody tr');
  rows.forEach(row => {
    if (filter === 'all' || row.dataset.status === filter) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function conditionBadge(cond) {
  const map = {
    good: { bg: '#ECFDF5', color: '#059669', icon: 'fa-check-circle', label: 'Good' },
    damaged: { bg: '#FEF2F2', color: '#DC2626', icon: 'fa-exclamation-triangle', label: 'Damaged' },
    expired: { bg: '#FEF3C7', color: '#92400E', icon: 'fa-clock', label: 'Expired' },
    opened: { bg: '#FFF7ED', color: '#EA580C', icon: 'fa-box-open', label: 'Opened' },
    missing: { bg: '#F3F4F6', color: '#6B7280', icon: 'fa-question-circle', label: 'Missing' }
  };
  const m = map[cond] || { bg: '#F3F4F6', color: '#6B7280', icon: 'fa-circle', label: cond || '—' };
  return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${m.bg};color:${m.color}"><i class="fas ${m.icon}" style="font-size:9px"></i> ${m.label}</span>`;
}

async function showReturnDetail(returnId) {
  try {
    const { data } = await API.get(`/returns/${returnId}`);
    const r = data['return'] || data.return_record || data;
    const items = data.items || r.items || [];
    const isReceived = r.status === 'received' || r.status === 'processed';
    const anyReceived = items.some(it => it.received);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    // Receive info banner
    const receiveBanner = isReceived ? `
      <div style="padding:10px 14px;background:linear-gradient(135deg,#F0E6FF,#EDE9FE);border-radius:8px;margin-bottom:12px;font-size:13px;border:1px solid #DDD6FE">
        <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#7C3AED;margin-bottom:4px">
          <i class="fas fa-clipboard-check"></i> Received
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px">
          <div><span style="color:var(--gray-500)">Received by:</span> <strong>${r.received_by_name || '—'}</strong></div>
          <div><span style="color:var(--gray-500)">Date:</span> <strong>${r.received_at ? formatDate(r.received_at) : '—'}</strong></div>
          <div><span style="color:var(--gray-500)">Status:</span> ${statusBadge(r.status)}</div>
        </div>
        ${r.receive_notes ? `<div style="margin-top:6px;padding:6px 8px;background:white;border-radius:6px;font-size:12px;color:var(--gray-600)"><i class="fas fa-comment" style="color:var(--gray-400);font-size:10px"></i> ${escapeHtml(r.receive_notes)}</div>` : ''}
      </div>` : '';

    // Item rows — show receive data columns if any item has been received
    const showReceiveCols = anyReceived || isReceived;
    const itemRows = items.map(it => {
      const diff = (it.actual_qty||0) - (it.expected_qty||0);
      return `<tr style="border-top:1px solid var(--gray-100)">
        <td style="padding:8px"><strong>${it.product_name||'?'}</strong>${it.sku?`<div style="font-size:10px;color:var(--gray-400)">SKU: ${it.sku}</div>`:''}</td>
        <td style="padding:8px;text-align:center;font-weight:600">${it.expected_qty||0}</td>
        <td style="padding:8px;text-align:center;font-weight:600">${it.actual_qty||0}</td>
        <td style="padding:8px;text-align:center;font-weight:700;color:${diff!==0?'#DC2626':'#059669'}">${diff>0?'+':''}${diff}</td>
        <td style="padding:8px;color:var(--gray-500)">${it.reason ? it.reason.replace(/_/g,' ') : '—'}</td>
        ${showReceiveCols ? `
          <td style="padding:8px;text-align:center">${it.received ? `<span style="font-weight:700;color:#059669">${it.received_qty||0}</span>` : '<span style="color:var(--gray-300)">—</span>'}</td>
          <td style="padding:8px;text-align:center">${it.received ? conditionBadge(it.condition) : '<span style="color:var(--gray-300)">—</span>'}</td>
          <td style="padding:8px;text-align:center">${it.received ? (it.restock ? '<i class="fas fa-check-circle" style="color:#059669"></i> Yes' : '<i class="fas fa-times-circle" style="color:#DC2626"></i> No') : '<span style="color:var(--gray-300)">—</span>'}</td>
        ` : ''}
      </tr>`;
    }).join('');

    // Summary stats for received items
    const receivedItems = items.filter(it => it.received);
    const totalExpected = items.reduce((s, i) => s + (i.expected_qty||0), 0);
    const totalReceivedQty = receivedItems.reduce((s, i) => s + (i.received_qty||0), 0);
    const goodCount = receivedItems.filter(i => i.condition === 'good').length;
    const damagedCount = receivedItems.filter(i => i.condition !== 'good' && i.condition !== null).length;
    const restockCount = receivedItems.filter(i => i.restock).length;

    const receiveSummary = anyReceived ? `
      <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px;padding:8px 12px;background:#F0FDF4;border-radius:8px;text-align:center;border:1px solid #D1FAE5">
          <div style="font-size:18px;font-weight:800;color:#059669">${totalReceivedQty}</div>
          <div style="font-size:10px;color:#6B7280;font-weight:600">Received</div>
        </div>
        <div style="flex:1;min-width:100px;padding:8px 12px;background:#ECFDF5;border-radius:8px;text-align:center;border:1px solid #D1FAE5">
          <div style="font-size:18px;font-weight:800;color:#059669">${goodCount}</div>
          <div style="font-size:10px;color:#6B7280;font-weight:600">Good Condition</div>
        </div>
        <div style="flex:1;min-width:100px;padding:8px 12px;background:${damagedCount > 0 ? '#FEF2F2' : '#F3F4F6'};border-radius:8px;text-align:center;border:1px solid ${damagedCount > 0 ? '#FECACA' : '#E5E7EB'}">
          <div style="font-size:18px;font-weight:800;color:${damagedCount > 0 ? '#DC2626' : '#6B7280'}">${damagedCount}</div>
          <div style="font-size:10px;color:#6B7280;font-weight:600">Damaged/Other</div>
        </div>
        <div style="flex:1;min-width:100px;padding:8px 12px;background:#EFF6FF;border-radius:8px;text-align:center;border:1px solid #BFDBFE">
          <div style="font-size:18px;font-weight:800;color:#2563EB">${restockCount}</div>
          <div style="font-size:10px;color:#6B7280;font-weight:600">To Restock</div>
        </div>
      </div>` : '';

    modal.innerHTML = `<div class="modal" style="max-width:${showReceiveCols ? '850px' : '650px'}">
      <div class="modal-header" style="background:linear-gradient(135deg,#EDE9FE,#DDD6FE);border-bottom:2px solid #7C3AED">
        <h3 class="modal-title"><i class="fas fa-rotate-left" style="color:#7C3AED"></i> Return #${r.id}${r.business_name ? ' — ' + r.business_name : ''}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
          <div><div class="form-label">Status</div>${statusBadge(r.status)}</div>
          <div><div class="form-label">Order</div><strong>${r.order_number||'—'}</strong></div>
          <div><div class="form-label">Route</div><strong>${r.route_number||'—'}</strong></div>
          <div><div class="form-label">Created By</div>${r.created_by_name||'—'}</div>
          <div><div class="form-label">Created</div>${formatDate(r.created_at)}</div>
          <div><div class="form-label">Updated</div>${formatDate(r.updated_at)}</div>
        </div>
        ${receiveBanner}
        ${r.notes ? `<div style="padding:10px;background:#F3F4F6;border-radius:8px;margin-bottom:12px;font-size:13px"><i class="fas fa-sticky-note" style="color:var(--gray-400)"></i> ${escapeHtml(r.notes)}</div>` : ''}
        ${receiveSummary}
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Return Items</div>
        <div style="overflow-x:auto">
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="background:var(--gray-50)">
            <th style="padding:8px;text-align:left">Product</th>
            <th style="padding:8px;text-align:center">Expected</th>
            <th style="padding:8px;text-align:center">Actual</th>
            <th style="padding:8px;text-align:center">Diff</th>
            <th style="padding:8px;text-align:left">Reason</th>
            ${showReceiveCols ? `
              <th style="padding:8px;text-align:center;background:#F5F3FF">Rcvd Qty</th>
              <th style="padding:8px;text-align:center;background:#F5F3FF">Condition</th>
              <th style="padding:8px;text-align:center;background:#F5F3FF">Restock</th>
            ` : ''}
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        </div>
      </div>
      <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-sm" style="background:#2563EB;color:white;font-weight:700" onclick="this.closest('.modal-overlay').remove();showEditReturnModal(${r.id})">
            <i class="fas fa-pen"></i> Edit
          </button>
          <button class="btn btn-sm" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700" onclick="this.closest('.modal-overlay').remove();showReceiveReturnModal(${r.id})">
            <i class="fas fa-clipboard-check"></i> Receive
          </button>
          ${r.status === 'received' ? `
            <button class="btn btn-sm" style="background:#059669;color:white;font-weight:700" onclick="markReturnProcessed(${r.id})">
              <i class="fas fa-check-double"></i> Mark Processed
            </button>
          ` : ''}
          <select class="form-select" style="width:auto;font-size:12px;padding:4px 8px" id="returnStatusSelect">
            <option value="pending" ${r.status==='pending'?'selected':''}>Pending</option>
            <option value="approved" ${r.status==='approved'?'selected':''}>Approved</option>
            <option value="received" ${r.status==='received'?'selected':''}>Received</option>
            <option value="processed" ${r.status==='processed'?'selected':''}>Processed</option>
            <option value="rejected" ${r.status==='rejected'?'selected':''}>Rejected</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="updateReturnStatus(${r.id})"><i class="fas fa-save"></i> Set Status</button>
        </div>
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch (err) { showToast('Failed to load return details', 'error'); }
}

// ==================== EDIT RETURN MODAL ====================
async function showEditReturnModal(returnId) {
  try {
    const [retRes, productsRes] = await Promise.all([
      API.get(`/returns/${returnId}`),
      API.get('/products')
    ]);
    const r = retRes.data['return'] || retRes.data.return_record || retRes.data;
    const items = retRes.data.items || r.items || [];
    const products = productsRes.data.products || [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '10002';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    window._editReturnProducts = products;
    window._editReturnItemCounter = 0;

    const itemRows = items.map(it => editReturnItemRowHtml(products, it.product_id, it.expected_qty, it.actual_qty, it.reason)).join('');

    modal.innerHTML = `<div class="modal modal-lg" style="max-width:750px">
      <div class="modal-header" style="background:linear-gradient(135deg,#DBEAFE,#BFDBFE);border-bottom:2px solid #2563EB">
        <h3 class="modal-title"><i class="fas fa-pen" style="color:#2563EB"></i> Edit Return #${r.id}${r.business_name ? ' — ' + r.business_name : ''}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body" style="max-height:65vh;overflow-y:auto">
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="editReturnNotes" rows="2" style="font-size:13px">${r.notes || ''}</textarea>
        </div>

        <div style="border-top:1px solid var(--gray-200);padding-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label class="form-label" style="margin:0;font-size:14px;font-weight:700"><i class="fas fa-boxes-stacked" style="color:#2563EB"></i> Return Items</label>
            <button class="btn btn-outline btn-sm" onclick="addEditReturnItemRow()"><i class="fas fa-plus"></i> Add Item</button>
          </div>
          <div id="editReturnItemsContainer">
            <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:4px;padding:6px 8px;background:var(--gray-50);border-radius:8px;font-size:11px;font-weight:600;color:var(--gray-500)">
              <div>Product</div><div>Expected Qty</div><div>Actual Qty</div><div>Reason</div><div></div>
            </div>
            ${itemRows || editReturnItemRowHtml(products, '', 0, 0, '')}
          </div>
        </div>

        <div style="font-size:12px;color:var(--gray-400);padding:10px 0;display:flex;align-items:center;gap:6px">
          <i class="fas fa-info-circle"></i>
          <span><strong>Expected</strong> = what the office expects to come back. <strong>Actual</strong> = what was physically returned by the driver/customer.</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn" style="background:#2563EB;color:white;font-weight:700" onclick="submitEditReturn(${r.id})"><i class="fas fa-save"></i> Save Changes</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch (err) {
    showToast('Failed to load return for editing: ' + (err.message || err), 'error');
  }
}

function editReturnItemRowHtml(products, selectedProductId, expectedQty, actualQty, reason) {
  const id = window._editReturnItemCounter++;
  return `<div class="edit-return-item-row" data-idx="${id}" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:4px;align-items:center">
    <select class="form-select" style="font-size:12px;padding:6px 8px" data-field="product_id">
      <option value="">-- Product --</option>
      ${products.map(p => `<option value="${p.id}" ${p.id==selectedProductId?'selected':''}>${p.name} ${p.sku?'('+p.sku+')':''}</option>`).join('')}
    </select>
    <input class="form-input" type="number" min="0" value="${expectedQty||0}" data-field="expected_qty" placeholder="0" style="font-size:13px;padding:6px 8px;text-align:center;font-weight:700">
    <input class="form-input" type="number" min="0" value="${actualQty||0}" data-field="actual_qty" placeholder="0" style="font-size:13px;padding:6px 8px;text-align:center;font-weight:700">
    <select class="form-select" style="font-size:11px;padding:6px 4px" data-field="reason">
      <option value="">—</option>
      <option value="damaged" ${reason==='damaged'?'selected':''}>Damaged</option>
      <option value="wrong_item" ${reason==='wrong_item'?'selected':''}>Wrong Item</option>
      <option value="overstock" ${reason==='overstock'?'selected':''}>Overstock</option>
      <option value="refused" ${reason==='refused'?'selected':''}>Refused</option>
      <option value="expired" ${reason==='expired'?'selected':''}>Expired</option>
      <option value="other" ${reason==='other'?'selected':''}>Other</option>
    </select>
    <button class="btn-icon" onclick="this.closest('.edit-return-item-row').remove()" title="Remove"><i class="fas fa-times" style="color:var(--red)"></i></button>
  </div>`;
}

function addEditReturnItemRow() {
  const container = document.getElementById('editReturnItemsContainer');
  if (!container) return;
  const products = window._editReturnProducts || [];
  container.insertAdjacentHTML('beforeend', editReturnItemRowHtml(products, '', 0, 0, ''));
}

async function submitEditReturn(returnId) {
  const notes = document.getElementById('editReturnNotes')?.value || '';
  const rows = document.querySelectorAll('.edit-return-item-row');
  const items = [];
  rows.forEach(row => {
    const productId = parseInt(row.querySelector('[data-field="product_id"]')?.value);
    const expectedQty = parseInt(row.querySelector('[data-field="expected_qty"]')?.value) || 0;
    const actualQty = parseInt(row.querySelector('[data-field="actual_qty"]')?.value) || 0;
    const reason = row.querySelector('[data-field="reason"]')?.value || '';
    if (productId && (expectedQty > 0 || actualQty > 0)) {
      items.push({ product_id: productId, expected_qty: expectedQty, actual_qty: actualQty, reason });
    }
  });

  if (items.length === 0) { showToast('Add at least one item with a quantity', 'warning'); return; }

  try {
    await API.put(`/returns/${returnId}`, { notes, items });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Return updated!', 'success');
    renderReturns();
  } catch (err) {
    showToast('Failed to update return: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// ==================== RECEIVE RETURN MODAL ====================
async function showReceiveReturnModal(returnId) {
  try {
    const { data } = await API.get(`/returns/${returnId}`);
    const r = data['return'] || data.return_record || data;
    const items = data.items || r.items || [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '10002';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const itemRows = items.map((it, idx) => {
      const preQty = it.received_qty || it.actual_qty || it.expected_qty || 0;
      const preCond = it.condition || 'good';
      const preRestock = it.restock ? 'checked' : (it.condition === 'good' || !it.condition) ? 'checked' : '';
      return `<div class="receive-item-row" data-item-id="${it.id}" style="padding:12px;background:${idx%2===0?'white':'#FAFAFA'};border-bottom:1px solid #F3F4F6">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <i class="fas fa-box" style="color:#7C3AED;font-size:12px"></i>
          <strong style="font-size:13px">${it.product_name||'?'}</strong>
          ${it.sku ? `<span style="font-size:10px;color:var(--gray-400);background:var(--gray-50);padding:1px 6px;border-radius:4px">SKU: ${it.sku}</span>` : ''}
          <span style="margin-left:auto;font-size:11px;color:var(--gray-500)">Expected: <strong style="color:var(--navy)">${it.expected_qty||0}</strong> | Driver reported: <strong style="color:var(--navy)">${it.actual_qty||0}</strong></span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1.2fr 1fr 1.5fr;gap:10px;align-items:end">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--gray-500);display:block;margin-bottom:3px">Qty Received</label>
            <input class="form-input" type="number" min="0" value="${preQty}" data-field="received_qty" style="font-size:13px;padding:7px 10px;text-align:center;font-weight:700;border:2px solid #E5E7EB">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--gray-500);display:block;margin-bottom:3px">Condition</label>
            <select class="form-select" data-field="condition" style="font-size:12px;padding:7px 8px;border:2px solid #E5E7EB">
              <option value="good" ${preCond==='good'?'selected':''}>Good</option>
              <option value="damaged" ${preCond==='damaged'?'selected':''}>Damaged</option>
              <option value="expired" ${preCond==='expired'?'selected':''}>Expired</option>
              <option value="opened" ${preCond==='opened'?'selected':''}>Opened / Used</option>
              <option value="missing" ${preCond==='missing'?'selected':''}>Missing</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding-bottom:4px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;font-weight:600;color:var(--gray-600)">
              <input type="checkbox" data-field="restock" ${preRestock} style="width:18px;height:18px;accent-color:#059669">
              Restock
            </label>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--gray-500);display:block;margin-bottom:3px">Notes</label>
            <input class="form-input" type="text" data-field="receive_notes" placeholder="Optional notes..." value="${it.receive_notes||''}" style="font-size:12px;padding:7px 8px;border:2px solid #E5E7EB">
          </div>
        </div>
        ${it.reason ? `<div style="margin-top:6px;font-size:11px;color:var(--gray-400)"><i class="fas fa-tag" style="font-size:9px"></i> Return reason: ${it.reason.replace(/_/g,' ')}</div>` : ''}
      </div>`;
    }).join('');

    modal.innerHTML = `<div class="modal modal-lg" style="max-width:800px">
      <div class="modal-header" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);border-bottom:none">
        <h3 class="modal-title" style="color:white"><i class="fas fa-clipboard-check"></i> Receive Return #${r.id}${r.business_name ? ' — ' + r.business_name : ''}</h3>
        <button class="modal-close" style="color:white" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div style="padding:12px 20px;background:linear-gradient(135deg,#F5F3FF,#EDE9FE);border-bottom:1px solid #DDD6FE;font-size:13px;color:#5B21B6">
        <i class="fas fa-info-circle"></i> Inspect each item below. Enter the quantity received, condition, and whether to restock. Then click <strong>Confirm Receipt</strong>.
      </div>
      <div class="modal-body" style="padding:0;max-height:55vh;overflow-y:auto">
        ${itemRows}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #E5E7EB;background:#FAFAFA">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:12px">Overall Receive Notes (optional)</label>
          <textarea class="form-textarea" id="receiveOverallNotes" rows="2" placeholder="Any general notes about this return receipt..." style="font-size:12px"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <div style="display:flex;gap:8px">
          <button class="btn" style="background:#059669;color:white;font-weight:700" onclick="submitReceiveReturn(${r.id}, true)">
            <i class="fas fa-check-double"></i> Receive & Process
          </button>
          <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700" onclick="submitReceiveReturn(${r.id}, false)">
            <i class="fas fa-clipboard-check"></i> Confirm Receipt
          </button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(modal);

    // Auto-set restock off when condition changes to damaged/expired/missing
    modal.querySelectorAll('[data-field="condition"]').forEach(sel => {
      sel.addEventListener('change', function() {
        const row = this.closest('.receive-item-row');
        const restockCb = row.querySelector('[data-field="restock"]');
        if (restockCb) {
          restockCb.checked = (this.value === 'good');
        }
      });
    });

  } catch (err) {
    showToast('Failed to load return for receiving: ' + (err.message || err), 'error');
  }
}

async function submitReceiveReturn(returnId, alsoProcess) {
  const rows = document.querySelectorAll('.receive-item-row');
  const items = [];
  rows.forEach(row => {
    const itemId = parseInt(row.dataset.itemId);
    if (!itemId) return;
    items.push({
      id: itemId,
      received_qty: parseInt(row.querySelector('[data-field="received_qty"]')?.value) || 0,
      condition: row.querySelector('[data-field="condition"]')?.value || 'good',
      restock: row.querySelector('[data-field="restock"]')?.checked || false,
      receive_notes: row.querySelector('[data-field="receive_notes"]')?.value || ''
    });
  });

  if (items.length === 0) { showToast('No items to receive', 'warning'); return; }

  try {
    await API.post(`/returns/${returnId}/receive`, {
      items,
      received_by: currentUser?.id || null,
      receive_notes: document.getElementById('receiveOverallNotes')?.value || ''
    });

    if (alsoProcess) {
      await API.post(`/returns/${returnId}/process`, {});
    }

    document.querySelector('.modal-overlay')?.remove();
    showToast(alsoProcess ? 'Return received & processed!' : 'Return received successfully!', 'success');
    renderReturns();
  } catch (err) {
    showToast('Failed to receive return: ' + (err.response?.data?.error || err.message), 'error');
  }
}

async function markReturnProcessed(returnId) {
  if (!confirm('Mark this return as fully processed (restocked / disposed)?')) return;
  try {
    await API.post(`/returns/${returnId}/process`, {});
    document.querySelector('.modal-overlay')?.remove();
    showToast('Return marked as processed!', 'success');
    renderReturns();
  } catch (err) { showToast('Failed to process return', 'error'); }
}

async function updateReturnStatus(returnId) {
  const status = document.getElementById('returnStatusSelect')?.value;
  if (!status) return;
  try {
    await API.put(`/returns/${returnId}`, { status });
    document.querySelector('.modal-overlay')?.remove();
    showToast('Return status updated!');
    renderReturns();
  } catch (err) { showToast('Failed to update', 'error'); }
}

async function deleteReturn(returnId) {
  if (!confirm('Delete this return record?')) return;
  try {
    await API.delete(`/returns/${returnId}`);
    showToast('Return deleted');
    renderReturns();
  } catch (err) { showToast('Failed to delete', 'error'); }
}

// ==================== AI LEARNING DASHBOARD ====================
async function renderLearningDashboard() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-brain fa-spin fa-2x" style="color:#7C3AED"></i><p style="margin-top:12px;color:var(--gray-500)">Loading AI Learning Engine...</p></div>';

  try {
    const { data } = await API.get('/learning/stats');
    const t = data.totals || {};
    const hasData = t.route_snapshots > 0;

    // Stat cards
    const stats = [
      { icon: 'fa-camera', label: 'Route Snapshots', value: t.route_snapshots || 0, color: '#7C3AED', desc: 'Routes analyzed' },
      { icon: 'fa-link', label: 'Customer Pairings', value: t.customer_pairings || 0, color: '#2563EB', desc: 'Learned groupings' },
      { icon: 'fa-truck', label: 'Truck Assignments', value: t.truck_assignments || 0, color: '#059669', desc: 'Customer→truck links' },
      { icon: 'fa-user', label: 'Driver Assignments', value: t.driver_assignments || 0, color: '#D97706', desc: 'Customer→driver links' },
      { icon: 'fa-calendar-days', label: 'Day Patterns', value: t.day_patterns || 0, color: '#DC2626', desc: 'Delivery day habits' },
      { icon: 'fa-pen-ruler', label: 'Pallet Corrections', value: t.pallet_corrections || 0, color: '#7C3AED', desc: 'Manual overrides learned' },
    ];

    const statCards = stats.map(s => `
      <div style="background:white;border-radius:12px;padding:16px;border:1px solid #E5E7EB;flex:1;min-width:140px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:32px;height:32px;border-radius:8px;background:${s.color}15;display:flex;align-items:center;justify-content:center"><i class="fas ${s.icon}" style="color:${s.color};font-size:14px"></i></div>
          <div style="font-size:11px;color:var(--gray-500);font-weight:600">${s.label}</div>
        </div>
        <div style="font-size:28px;font-weight:800;color:var(--navy)">${s.value}</div>
        <div style="font-size:10px;color:var(--gray-400)">${s.desc}</div>
      </div>
    `).join('');

    // Customer pairings table
    const pairingRows = (data.top_customer_pairings || []).slice(0, 15).map((p, i) => {
      const strength = p.times_paired >= 10 ? 'strong' : p.times_paired >= 5 ? 'medium' : 'weak';
      const barColor = strength === 'strong' ? '#059669' : strength === 'medium' ? '#D97706' : '#9CA3AF';
      const maxPair = Math.max(...(data.top_customer_pairings || []).map(x => x.times_paired), 1);
      const pct = Math.round((p.times_paired / maxPair) * 100);
      return `<tr>
        <td style="font-size:12px;font-weight:600">${i + 1}</td>
        <td style="font-size:12px"><span style="color:var(--navy);font-weight:600">${p.customer_a_name}</span></td>
        <td style="font-size:12px"><span style="color:var(--navy);font-weight:600">${p.customer_b_name}</span></td>
        <td style="font-size:12px;font-weight:700;text-align:center">${p.times_paired}x</td>
        <td style="width:120px"><div style="height:8px;background:#F3F4F6;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px"></div></div></td>
        <td style="font-size:11px;color:var(--gray-500)">${p.avg_sequence_gap ? p.avg_sequence_gap.toFixed(1) + ' stops apart' : '—'}</td>
      </tr>`;
    }).join('');

    // Truck affinity table
    const truckRows = (data.top_truck_affinities || []).slice(0, 15).map(a => {
      const maxT = Math.max(...(data.top_truck_affinities || []).map(x => x.times_assigned), 1);
      const pct = Math.round((a.times_assigned / maxT) * 100);
      return `<tr>
        <td style="font-size:12px;font-weight:600">${a.business_name}</td>
        <td style="font-size:12px"><i class="fas fa-truck" style="color:#059669;font-size:10px"></i> ${a.truck_name}</td>
        <td style="font-size:12px;font-weight:700;text-align:center">${a.times_assigned}x</td>
        <td style="width:100px"><div style="height:8px;background:#F3F4F6;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#059669;border-radius:4px"></div></div></td>
      </tr>`;
    }).join('');

    // Driver affinity table
    const driverRows = (data.top_driver_affinities || []).slice(0, 15).map(a => {
      const maxD = Math.max(...(data.top_driver_affinities || []).map(x => x.times_assigned), 1);
      const pct = Math.round((a.times_assigned / maxD) * 100);
      return `<tr>
        <td style="font-size:12px;font-weight:600">${a.business_name}</td>
        <td style="font-size:12px"><i class="fas fa-user" style="color:#D97706;font-size:10px"></i> ${a.driver_name}</td>
        <td style="font-size:12px;font-weight:700;text-align:center">${a.times_assigned}x</td>
        <td style="width:100px"><div style="height:8px;background:#F3F4F6;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#D97706;border-radius:4px"></div></div></td>
      </tr>`;
    }).join('');

    // Day-of-week distribution
    const dayOrder = ['mon','tue','wed','thu','fri','sat','sun'];
    const dayLabels = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };
    const dayData = {};
    for (const d of (data.day_distribution || [])) { dayData[d.day_of_week] = d.total || 0; }
    const maxDay = Math.max(...Object.values(dayData).map(Number), 1);
    const dayBars = dayOrder.map(d => {
      const val = dayData[d] || 0;
      const pct = Math.round((val / maxDay) * 100);
      const isTop = val === maxDay && val > 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:12px;width:80px;font-weight:${isTop ? '800' : '600'};color:${isTop ? '#7C3AED' : 'var(--navy)'}">${dayLabels[d] || d}</span>
        <div style="flex:1;height:20px;background:#F3F4F6;border-radius:6px;overflow:hidden;position:relative">
          <div style="height:100%;width:${pct}%;background:${isTop ? 'linear-gradient(90deg,#7C3AED,#A78BFA)' : 'linear-gradient(90deg,#3B82F6,#93C5FD)'};border-radius:6px;transition:width 0.5s"></div>
        </div>
        <span style="font-size:12px;font-weight:700;color:var(--navy);width:35px;text-align:right">${val}</span>
      </div>`;
    }).join('');

    pc.innerHTML = `
      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:20px;font-weight:800;color:var(--navy);margin:0;display:flex;align-items:center;gap:8px">
            <span style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-brain"></i></span>
            AI Learning Engine
          </h2>
          <p style="font-size:13px;color:var(--gray-500);margin:4px 0 0">The system learns from every route you create — customer groupings, truck assignments, pallet counts, and delivery patterns.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-outline" onclick="showPalletCorrectionHistory()"><i class="fas fa-pen-ruler"></i> Correction History</button>
          <button class="btn btn-sm btn-outline" onclick="showRouteTemplates()"><i class="fas fa-copy"></i> Route Templates</button>
        </div>
      </div>

      ${!hasData ? `
        <div style="text-align:center;padding:50px;background:white;border-radius:16px;border:1px solid #E5E7EB">
          <div style="font-size:64px;margin-bottom:16px">🧠</div>
          <h3 style="color:var(--navy);margin-bottom:8px">Learning In Progress</h3>
          <p style="color:var(--gray-500);max-width:400px;margin:0 auto 20px">The AI learns automatically from every route you create. Patterns, customer groupings, truck assignments, and delivery habits will appear here once you start building routes.</p>
          <p style="font-size:11px;color:var(--gray-400);margin-top:8px">Head to the Route Builder to create your first routes.</p>
        </div>
      ` : `
        <!-- Stats Row -->
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">${statCards}</div>

        <!-- Main Content Grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          
          <!-- Customer Pairings -->
          <div style="background:white;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;grid-column:1/3">
            <div style="padding:14px 16px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:center;gap:8px">
                <i class="fas fa-link" style="color:#2563EB"></i>
                <span style="font-weight:700;color:var(--navy)">Customer Pairings</span>
                <span style="font-size:10px;background:#EFF6FF;color:#2563EB;padding:2px 8px;border-radius:10px;font-weight:600">Customers frequently on the same route</span>
              </div>
            </div>
            <div style="max-height:350px;overflow-y:auto">
              ${pairingRows ? `<table class="table" style="margin:0"><thead><tr><th>#</th><th>Customer A</th><th>Customer B</th><th style="text-align:center">Times</th><th>Strength</th><th>Gap</th></tr></thead><tbody>${pairingRows}</tbody></table>` 
              : '<div style="padding:20px;text-align:center;color:var(--gray-400)">No pairings learned yet</div>'}
            </div>
          </div>

          <!-- Day-of-Week Patterns -->
          <div style="background:white;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden">
            <div style="padding:14px 16px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:8px">
              <i class="fas fa-calendar-days" style="color:#DC2626"></i>
              <span style="font-weight:700;color:var(--navy)">Delivery Day Patterns</span>
            </div>
            <div style="padding:16px">${dayBars || '<div style="color:var(--gray-400);text-align:center">No data yet</div>'}</div>
          </div>

          <!-- Truck Affinities -->
          <div style="background:white;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden">
            <div style="padding:14px 16px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:8px">
              <i class="fas fa-truck" style="color:#059669"></i>
              <span style="font-weight:700;color:var(--navy)">Truck Assignments</span>
              <span style="font-size:10px;background:#ECFDF5;color:#059669;padding:2px 8px;border-radius:10px;font-weight:600">Which truck each customer usually goes on</span>
            </div>
            <div style="max-height:350px;overflow-y:auto">
              ${truckRows ? `<table class="table" style="margin:0"><thead><tr><th>Customer</th><th>Usual Truck</th><th style="text-align:center">Times</th><th>Strength</th></tr></thead><tbody>${truckRows}</tbody></table>`
              : '<div style="padding:20px;text-align:center;color:var(--gray-400)">No truck assignments learned yet</div>'}
            </div>
          </div>

          <!-- Driver Affinities -->
          <div style="background:white;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden">
            <div style="padding:14px 16px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:8px">
              <i class="fas fa-user" style="color:#D97706"></i>
              <span style="font-weight:700;color:var(--navy)">Driver Assignments</span>
              <span style="font-size:10px;background:#FFFBEB;color:#D97706;padding:2px 8px;border-radius:10px;font-weight:600">Which driver usually delivers to each customer</span>
            </div>
            <div style="max-height:350px;overflow-y:auto">
              ${driverRows ? `<table class="table" style="margin:0"><thead><tr><th>Customer</th><th>Usual Driver</th><th style="text-align:center">Times</th><th>Strength</th></tr></thead><tbody>${driverRows}</tbody></table>`
              : '<div style="padding:20px;text-align:center;color:var(--gray-400)">No driver assignments learned yet</div>'}
            </div>
          </div>

        </div>

        <!-- How It Works -->
        <div style="margin-top:20px;background:linear-gradient(135deg,#F5F3FF,#EDE9FE);border-radius:12px;padding:20px;border:1px solid #DDD6FE">
          <div style="font-weight:700;color:#5B21B6;margin-bottom:12px;font-size:14px"><i class="fas fa-lightbulb"></i> How the AI Learning Engine Works</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="background:#7C3AED;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">1</span>
              <div><strong style="font-size:12px;color:#5B21B6">Creates Routes</strong><p style="font-size:11px;color:#6D28D9;margin:2px 0 0">Every time you create or complete a route, the system takes a snapshot of all stops, truck, driver, and zone info.</p></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="background:#7C3AED;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">2</span>
              <div><strong style="font-size:12px;color:#5B21B6">Learns Patterns</strong><p style="font-size:11px;color:#6D28D9;margin:2px 0 0">It discovers which customers go together, which truck they use, which driver delivers, and which day they prefer.</p></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="background:#7C3AED;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">3</span>
              <div><strong style="font-size:12px;color:#5B21B6">Recommends</strong><p style="font-size:11px;color:#6D28D9;margin:2px 0 0">In Route Builder, click <strong>AI Suggest</strong> to get smart groupings based on all learned patterns.</p></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="background:#7C3AED;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">4</span>
              <div><strong style="font-size:12px;color:#5B21B6">Corrects & Improves</strong><p style="font-size:11px;color:#6D28D9;margin:2px 0 0">When you correct a pallet count on a route, the system learns the real count for next time.</p></div>
            </div>
          </div>
        </div>
      `}
    `;
  } catch (err) {
    pc.innerHTML = `<div class="card"><div class="card-body"><div class="scan-result-banner error"><i class="fas fa-exclamation-circle"></i> Failed to load learning data: ${err.message}</div></div></div>`;
  }
}

async function runLearningBackfill(btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing routes...'; }
  try {
    const { data } = await API.post('/learning/backfill');
    showToast(`AI analyzed ${data.routes_processed} routes successfully!`, 'success');
    renderLearningDashboard();
  } catch (e) {
    showToast('Backfill failed: ' + (e.response?.data?.error || e.message), 'error');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-database"></i> Re-Analyze All Routes'; }
  }
}

async function showPalletCorrectionHistory() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:700px"><div class="modal-header"><h3 class="modal-title"><i class="fas fa-pen-ruler" style="color:#D97706"></i> Pallet Correction History</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div><div class="modal-body"><div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i></div></div></div>`;
  document.body.appendChild(modal);

  try {
    const { data } = await API.get('/learning/pallet-corrections');
    const rows = (data.corrections || []).map(c => {
      const diff = c.actual_pallets - c.calculated_pallets;
      const diffColor = diff > 0 ? '#DC2626' : diff < 0 ? '#059669' : '#6B7280';
      const diffSign = diff > 0 ? '+' : '';
      return `<tr>
        <td style="font-size:11px">${c.order_number || '—'}</td>
        <td style="font-size:11px">${c.business_name || '—'}</td>
        <td style="font-size:12px;text-align:center;font-weight:700;color:var(--gray-400)">${c.calculated_pallets}p</td>
        <td style="text-align:center;font-size:14px;color:var(--gray-400)"><i class="fas fa-arrow-right"></i></td>
        <td style="font-size:12px;text-align:center;font-weight:700;color:#D97706">${c.actual_pallets}p</td>
        <td style="font-size:12px;text-align:center;font-weight:700;color:${diffColor}">${diffSign}${diff}</td>
        <td style="font-size:11px;color:var(--gray-500)">${c.notes || '—'}</td>
        <td style="font-size:10px;color:var(--gray-400)">${dayjs(c.created_at).format('MMM D')}</td>
      </tr>`;
    }).join('');

    modal.querySelector('.modal-body').innerHTML = rows ? `
      <div style="margin-bottom:12px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:10px;font-size:12px;color:#92400E">
        <i class="fas fa-lightbulb"></i> Each correction teaches the system. After enough corrections for a product, the AI will automatically use the learned pallet count.
      </div>
      <div style="max-height:400px;overflow-y:auto">
        <table class="table" style="margin:0"><thead><tr><th>Order</th><th>Customer</th><th style="text-align:center">Calc'd</th><th></th><th style="text-align:center">Actual</th><th style="text-align:center">Diff</th><th>Notes</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    ` : '<div style="text-align:center;padding:30px;color:var(--gray-400)"><i class="fas fa-check-circle" style="font-size:32px;margin-bottom:8px;display:block"></i>No corrections yet. Click the pallet count on any route stop to correct it.</div>';
  } catch (e) {
    modal.querySelector('.modal-body').innerHTML = `<div class="scan-result-banner error">Failed to load corrections</div>`;
  }
}

async function showRouteTemplates() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:700px;max-height:85vh"><div class="modal-header" style="background:linear-gradient(135deg,#7C3AED,#5B21B6)"><h3 class="modal-title" style="color:white"><i class="fas fa-copy"></i> Route Templates</h3><button class="modal-close" style="color:white" onclick="this.closest('.modal-overlay').remove()">&times;</button></div><div class="modal-body"><div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin" style="color:#7C3AED"></i></div></div></div>`;
  document.body.appendChild(modal);

  try {
    const { data } = await API.get('/learning/templates?limit=20');
    const templates = data.templates || [];
    const dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };

    const cards = templates.map(t => {
      const stops = JSON.parse(t.stops_json || '[]');
      const customerNames = stops.slice(0, 5).map(s => s.customer_id).filter(Boolean);
      const dayLabel = dayLabels[t.day_of_week] || t.day_of_week;
      return `<div style="border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:8px;background:white;transition:box-shadow 0.15s" onmouseenter="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'" onmouseleave="this.style.boxShadow='none'">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-size:10px;font-weight:800;padding:3px 10px;border-radius:8px">${dayLabel}</span>
            <span style="font-size:12px;font-weight:700;color:var(--navy)">${t.date}</span>
            ${t.truck_name ? `<span style="font-size:11px;color:#059669"><i class="fas fa-truck" style="font-size:10px"></i> ${t.truck_name}</span>` : ''}
            ${t.driver_name ? `<span style="font-size:11px;color:#D97706"><i class="fas fa-user" style="font-size:10px"></i> ${t.driver_name}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--gray-500)">${t.stop_count} stops · ${t.total_pallets || 0}p</span>
            <button class="btn btn-sm" onclick="cloneRouteTemplate(${t.id})" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700;font-size:10px;padding:4px 10px"><i class="fas fa-copy"></i> Use Template</button>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${stops.slice(0, 8).map(s => `<span style="font-size:10px;padding:2px 6px;background:#EEF2FF;color:#3730A3;border-radius:4px;font-weight:600">Customer #${s.customer_id}</span>`).join('')}
          ${stops.length > 8 ? `<span style="font-size:10px;color:var(--gray-400)">+${stops.length - 8} more</span>` : ''}
        </div>
      </div>`;
    }).join('');

    modal.querySelector('.modal-body').innerHTML = templates.length > 0 ? `
      <div style="margin-bottom:12px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:10px;font-size:12px;color:#5B21B6">
        <i class="fas fa-info-circle"></i> Route templates are snapshots of past routes. Click <strong>Use Template</strong> to find matching orders for that same customer grouping.
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        ${['all','mon','tue','wed','thu','fri','sat'].map(d => `<button class="btn btn-sm ${d === 'all' ? 'btn-primary' : 'btn-outline'}" onclick="filterTemplates('${d}', this)" style="font-size:11px;padding:3px 10px">${d === 'all' ? 'All Days' : dayLabels[d]}</button>`).join('')}
      </div>
      <div id="templatesList" style="max-height:50vh;overflow-y:auto">${cards}</div>
    ` : '<div style="text-align:center;padding:30px;color:var(--gray-400)"><i class="fas fa-copy" style="font-size:32px;margin-bottom:8px;display:block"></i>No route templates yet. Create and complete some routes first.</div>';
  } catch (e) {
    modal.querySelector('.modal-body').innerHTML = `<div class="scan-result-banner error">Failed to load templates: ${e.message}</div>`;
  }
}

async function filterTemplates(day, btnEl) {
  // Toggle active button style
  const parent = btnEl.parentElement;
  parent.querySelectorAll('.btn').forEach(b => { b.className = 'btn btn-sm btn-outline'; b.style.fontSize = '11px'; b.style.padding = '3px 10px'; });
  btnEl.className = 'btn btn-sm btn-primary';

  try {
    const url = day === 'all' ? '/learning/templates?limit=20' : `/learning/templates?day_of_week=${day}&limit=20`;
    const { data } = await API.get(url);
    const templates = data.templates || [];
    const dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
    const list = document.getElementById('templatesList');
    if (!list) return;

    if (templates.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400)">No templates for this day</div>';
      return;
    }

    list.innerHTML = templates.map(t => {
      const stops = JSON.parse(t.stops_json || '[]');
      const dayLabel = dayLabels[t.day_of_week] || t.day_of_week;
      return `<div style="border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:8px;background:white">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-size:10px;font-weight:800;padding:3px 10px;border-radius:8px">${dayLabel}</span>
            <span style="font-size:12px;font-weight:700;color:var(--navy)">${t.date}</span>
            ${t.truck_name ? `<span style="font-size:11px;color:#059669"><i class="fas fa-truck" style="font-size:10px"></i> ${t.truck_name}</span>` : ''}
            ${t.driver_name ? `<span style="font-size:11px;color:#D97706"><i class="fas fa-user" style="font-size:10px"></i> ${t.driver_name}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--gray-500)">${t.stop_count} stops · ${t.total_pallets || 0}p</span>
            <button class="btn btn-sm" onclick="cloneRouteTemplate(${t.id})" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;font-weight:700;font-size:10px;padding:4px 10px"><i class="fas fa-copy"></i> Use Template</button>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${stops.slice(0, 8).map(s => `<span style="font-size:10px;padding:2px 6px;background:#EEF2FF;color:#3730A3;border-radius:4px;font-weight:600">Customer #${s.customer_id}</span>`).join('')}
          ${stops.length > 8 ? `<span style="font-size:10px;color:var(--gray-400)">+${stops.length - 8} more</span>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) { showToast('Failed to filter templates', 'error'); }
}

async function cloneRouteTemplate(snapshotId) {
  const newDate = dayjs().add(1, 'day').format('YYYY-MM-DD');
  try {
    const { data } = await API.post('/learning/clone-route', { snapshot_id: snapshotId, new_date: newDate });
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());

    const orders = data.available_orders || [];
    const missing = data.missing_customers || [];
    const tmpl = data.template || {};

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const orderRows = orders.map(o => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #F3F4F6">
        <input type="checkbox" checked data-order-id="${o.id}" style="accent-color:#7C3AED">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--navy)">${o.business_name}</div>
          <div style="font-size:11px;color:var(--gray-500)">${o.order_number} · ${o.street || ''}, ${o.city || ''}</div>
        </div>
      </div>
    `).join('');

    const missingHtml = missing.length > 0 ? `
      <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:10px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:#92400E"><i class="fas fa-exclamation-triangle"></i> Missing from template</div>
        <div style="font-size:11px;color:#A16207;margin-top:4px">These customers from the original route don't have pending orders: <strong>${missing.join(', ')}</strong></div>
      </div>
    ` : '';

    modal.innerHTML = `<div class="modal" style="max-width:550px;max-height:85vh">
      <div class="modal-header" style="background:linear-gradient(135deg,#7C3AED,#5B21B6)">
        <h3 class="modal-title" style="color:white"><i class="fas fa-copy"></i> Clone Route Template</h3>
        <button class="modal-close" style="color:white" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background:#F5F3FF;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#5B21B6">
          <i class="fas fa-info-circle"></i> Original: <strong>${tmpl.day_of_week?.toUpperCase()} ${tmpl.date}</strong> · ${tmpl.stop_count} stops · ${tmpl.total_pallets}p
          ${tmpl.truck_name ? ` · <i class="fas fa-truck"></i> ${tmpl.truck_name}` : ''}${tmpl.driver_name ? ` · <i class="fas fa-user"></i> ${tmpl.driver_name}` : ''}
        </div>
        ${missingHtml}
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-clipboard-list"></i> Available Orders (${orders.length})</div>
        ${orders.length > 0 ? `<div style="max-height:300px;overflow-y:auto;border:1px solid #E5E7EB;border-radius:8px">${orderRows}</div>` 
        : '<div style="text-align:center;padding:20px;color:var(--gray-400)">No matching pending orders found</div>'}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        ${orders.length > 0 ? `<button class="btn btn-primary" onclick="applyClonedTemplate(this, ${data.suggested_truck_id || 'null'}, ${data.suggested_driver_id || 'null'})" style="background:linear-gradient(135deg,#7C3AED,#5B21B6)">
          <i class="fas fa-route"></i> Open in Route Builder
        </button>` : ''}
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch (e) {
    showToast('Failed to clone template: ' + (e.response?.data?.error || e.message), 'error');
  }
}

function applyClonedTemplate(btnEl, truckId, driverId) {
  const modal = btnEl.closest('.modal-overlay');
  const checkedOrders = [...modal.querySelectorAll('input[data-order-id]:checked')].map(cb => parseInt(cb.dataset.orderId));
  if (checkedOrders.length === 0) { showToast('Select at least one order', 'warning'); return; }

  // Store the template data for the route builder to pick up
  window._clonedTemplate = { order_ids: checkedOrders, truck_id: truckId, driver_id: driverId };
  modal.remove();
  navigate('route_builder');
  showToast(`Template loaded with ${checkedOrders.length} orders — they'll appear in Route Builder`, 'success');
}

// ==================== LEARNING HINTS ON ORDER CARDS ====================
async function loadOrderLearningHints(orderIds) {
  if (!orderIds || orderIds.length === 0) return;
  try {
    const { data } = await API.post('/learning/order-hints', { order_ids: orderIds });
    const hints = data.hints || {};
    for (const [orderId, hint] of Object.entries(hints)) {
      const el = document.getElementById(`learning-hint-${orderId}`);
      if (!el) continue;
      const pills = [];
      if (hint.usual_truck) pills.push(`<span style="font-size:9px;padding:1px 5px;background:#ECFDF5;color:#059669;border-radius:4px;white-space:nowrap" title="Usually goes on ${hint.usual_truck.name} (${hint.usual_truck.count}x)"><i class="fas fa-truck" style="font-size:8px"></i> ${hint.usual_truck.name}</span>`);
      if (hint.usual_driver) pills.push(`<span style="font-size:9px;padding:1px 5px;background:#FFFBEB;color:#D97706;border-radius:4px;white-space:nowrap" title="Usually delivered by ${hint.usual_driver.name} (${hint.usual_driver.count}x)"><i class="fas fa-user" style="font-size:8px"></i> ${hint.usual_driver.name}</span>`);
      if (hint.usually_with) pills.push(`<span style="font-size:9px;padding:1px 5px;background:#EEF2FF;color:#3730A3;border-radius:4px;white-space:nowrap" title="Usually paired with ${hint.usually_with.name} (${hint.usually_with.count}x)"><i class="fas fa-link" style="font-size:8px"></i> ${hint.usually_with.name}</span>`);
      if (hint.best_day) pills.push(`<span style="font-size:9px;padding:1px 5px;background:#FDF2F8;color:#BE185D;border-radius:4px;white-space:nowrap" title="Most deliveries on ${hint.best_day.day}s (${hint.best_day.count}x)"><i class="fas fa-calendar" style="font-size:8px"></i> ${hint.best_day.day}</span>`);
      if (hint.pallet_adjustment && hint.pallet_adjustment.avg !== 0) {
        const sign = hint.pallet_adjustment.avg > 0 ? '+' : '';
        pills.push(`<span style="font-size:9px;padding:1px 5px;background:#FEF3C7;color:#92400E;border-radius:4px;white-space:nowrap" title="Pallet corrections avg ${sign}${hint.pallet_adjustment.avg} from ${hint.pallet_adjustment.samples} corrections"><i class="fas fa-pen-ruler" style="font-size:8px"></i> ${sign}${hint.pallet_adjustment.avg}p</span>`);
      }
      if (pills.length > 0) {
        el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${pills.join('')}</div>`;
        el.style.display = 'block';
      }
    }
  } catch (e) { /* hints are optional, fail silently */ }
}

// Customer learning profile modal
async function showCustomerLearningProfile(customerId, customerName) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:600px;max-height:85vh"><div class="modal-header" style="background:linear-gradient(135deg,#7C3AED,#5B21B6)"><h3 class="modal-title" style="color:white"><i class="fas fa-brain"></i> ${customerName || 'Customer'} — AI Insights</h3><button class="modal-close" style="color:white" onclick="this.closest('.modal-overlay').remove()">&times;</button></div><div class="modal-body"><div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin" style="color:#7C3AED"></i> Loading insights...</div></div></div>`;
  document.body.appendChild(modal);

  try {
    const { data } = await API.get(`/learning/customer/${customerId}`);
    const body = modal.querySelector('.modal-body');

    // Paired customers
    const pairHtml = (data.usually_paired_with || []).slice(0, 8).map(p => {
      const isStrong = p.times_paired >= 5;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #F3F4F6">
        <span style="font-size:12px;font-weight:${isStrong ? '700' : '500'};color:var(--navy);flex:1">${p.paired_with}</span>
        <span style="font-size:11px;font-weight:700;color:${isStrong ? '#059669' : 'var(--gray-500)'}">${p.times_paired}x</span>
      </div>`;
    }).join('');

    // Truck history
    const truckHtml = (data.truck_history || []).map(h => `
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:4px 10px;background:#ECFDF5;color:#059669;border-radius:6px;font-weight:600;margin:2px">
        <i class="fas fa-truck" style="font-size:10px"></i> ${h.truck_name} <span style="font-weight:800">${h.times_assigned}x</span>
      </span>
    `).join('');

    // Driver history
    const driverHtml = (data.driver_history || []).map(h => `
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:4px 10px;background:#FFFBEB;color:#D97706;border-radius:6px;font-weight:600;margin:2px">
        <i class="fas fa-user" style="font-size:10px"></i> ${h.driver_name} <span style="font-weight:800">${h.times_assigned}x</span>
      </span>
    `).join('');

    // Day patterns
    const dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
    const dayOrder = ['mon','tue','wed','thu','fri','sat','sun'];
    const dayMap = {};
    for (const d of (data.day_patterns || [])) { dayMap[d.day_of_week] = d.delivery_count; }
    const maxDayCount = Math.max(...Object.values(dayMap).map(Number), 1);
    const dayBarsHtml = dayOrder.map(d => {
      const val = dayMap[d] || 0;
      const pct = Math.round((val / maxDayCount) * 100);
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="font-size:11px;width:35px;font-weight:600;color:${val === maxDayCount && val > 0 ? '#7C3AED' : 'var(--navy)'}">${dayLabels[d]}</span>
        <div style="flex:1;height:12px;background:#F3F4F6;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${val === maxDayCount && val > 0 ? 'linear-gradient(90deg,#7C3AED,#A78BFA)' : '#93C5FD'};border-radius:4px"></div></div>
        <span style="font-size:11px;font-weight:700;width:25px;text-align:right">${val}</span>
      </div>`;
    }).join('');

    // Recent corrections
    const corrHtml = (data.recent_pallet_corrections || []).slice(0, 5).map(c => `
      <div style="font-size:11px;padding:4px 0;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between">
        <span>${c.calculated_pallets}p <i class="fas fa-arrow-right" style="font-size:9px;color:var(--gray-400)"></i> <strong style="color:#D97706">${c.actual_pallets}p</strong> ${c.notes ? `<span style="color:var(--gray-400)">— ${c.notes}</span>` : ''}</span>
        <span style="color:var(--gray-400)">${dayjs(c.created_at).format('MMM D')}</span>
      </div>
    `).join('');

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-link" style="color:#2563EB"></i> Usually Paired With</div>
          ${pairHtml || '<div style="font-size:11px;color:var(--gray-400)">No pairing data yet</div>'}
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-calendar-days" style="color:#DC2626"></i> Delivery Days</div>
          ${dayBarsHtml}
        </div>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-truck" style="color:#059669"></i> Truck History</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${truckHtml || '<span style="font-size:11px;color:var(--gray-400)">No truck data yet</span>'}</div>
      </div>
      <div style="margin-top:12px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-user" style="color:#D97706"></i> Driver History</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${driverHtml || '<span style="font-size:11px;color:var(--gray-400)">No driver data yet</span>'}</div>
      </div>
      ${corrHtml ? `<div style="margin-top:12px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><i class="fas fa-pen-ruler" style="color:#D97706"></i> Recent Pallet Corrections</div>
        ${corrHtml}
      </div>` : ''}
    `;
  } catch (e) {
    modal.querySelector('.modal-body').innerHTML = `<div class="scan-result-banner error">Failed to load customer insights</div>`;
  }
}

// ==================== FLEET SYNC (Verizon ↔ App Two-Way Sync) ====================
var _syncData = null;

async function renderFleetSync() {
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#9ca3af"></i><p style="margin-top:12px;color:var(--gray-500)">Loading fleet sync data from Verizon...</p></div>';
  try {
    const { data } = await API.get('/sync/status');
    _syncData = data;
    renderFleetSyncPage(data);
  } catch (e) {
    pc.innerHTML = `<div class="card" style="padding:40px;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i><h3>Failed to load sync data</h3><p style="color:var(--gray-500)">${e.message}</p><button class="btn btn-primary" onclick="renderFleetSync()"><i class="fas fa-redo"></i> Retry</button></div>`;
  }
}

function renderFleetSyncPage(data) {
  const pc = document.getElementById('pageContent');
  const { trucks, drivers, verizonVehicles, verizonDrivers, verizonError } = data;
  
  const linkedTrucks = trucks.filter(t => t.verizon_vehicle_id);
  const unlinkedTrucks = trucks.filter(t => !t.verizon_vehicle_id);
  const linkedDrivers = drivers.filter(d => d.verizon_driver_id);
  const unlinkedDrivers = drivers.filter(d => !d.verizon_driver_id);
  const linkedVIds = new Set(trucks.map(t => t.verizon_vehicle_id).filter(Boolean));
  const unlinkedVerizonVehicles = verizonVehicles.filter(v => !linkedVIds.has(v.VehicleId || v.Id));
  const linkedDIds = new Set(drivers.map(d => d.verizon_driver_id).filter(Boolean));
  const unlinkedVerizonDrivers = verizonDrivers.filter(d => {
    const did = d.DriverId || d.Id;
    if (linkedDIds.has(did)) return false;
    if ((d.FirstName||'').toLowerCase() === 'no' && (d.LastName||'').toLowerCase() === 'driver') return false;
    return true;
  });

  pc.innerHTML = `
    <div class="filters-bar no-print" style="flex-wrap:wrap;gap:8px">
      <button class="btn btn-primary" onclick="runAutoSync()"><i class="fas fa-magic"></i> Auto-Sync All</button>
      <button class="btn btn-outline" onclick="refreshVerizonVehicles()"><i class="fas fa-download"></i> Refresh Vehicle Data</button>
      <button class="btn btn-outline" onclick="renderFleetSync()"><i class="fas fa-redo"></i> Reload</button>
      ${verizonError ? `<span style="color:var(--red);font-size:13px"><i class="fas fa-exclamation-circle"></i> Verizon API: ${verizonError}</span>` : `<span style="color:var(--green);font-size:13px"><i class="fas fa-check-circle"></i> Connected — ${verizonVehicles.length} vehicles, ${verizonDrivers.length} drivers</span>`}
    </div>
    
    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px">
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:var(--navy)">${trucks.length}</div>
        <div style="font-size:12px;color:var(--gray-500)">App Trucks</div>
        <div style="font-size:11px;margin-top:4px"><span style="color:var(--green);font-weight:600">${linkedTrucks.length} linked</span> · <span style="color:var(--orange);font-weight:600">${unlinkedTrucks.length} unlinked</span></div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#7C3AED">${verizonVehicles.length}</div>
        <div style="font-size:12px;color:var(--gray-500)">Verizon Vehicles</div>
        <div style="font-size:11px;margin-top:4px"><span style="color:var(--green);font-weight:600">${linkedVIds.size} linked</span> · <span style="color:var(--orange);font-weight:600">${unlinkedVerizonVehicles.length} unlinked</span></div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:var(--navy)">${drivers.length}</div>
        <div style="font-size:12px;color:var(--gray-500)">App Users</div>
        <div style="font-size:11px;margin-top:4px"><span style="color:var(--green);font-weight:600">${linkedDrivers.length} linked</span> · <span style="color:var(--orange);font-weight:600">${unlinkedDrivers.length} unlinked</span></div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#7C3AED">${verizonDrivers.length}</div>
        <div style="font-size:12px;color:var(--gray-500)">Verizon Drivers</div>
        <div style="font-size:11px;margin-top:4px"><span style="color:var(--green);font-weight:600">${linkedDIds.size} linked</span> · <span style="color:var(--orange);font-weight:600">${unlinkedVerizonDrivers.length} unlinked</span></div>
      </div>
    </div>

    <!-- VEHICLES SECTION -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-body">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px"><i class="fas fa-truck" style="color:var(--navy-light);margin-right:8px"></i> Vehicle Sync</h3>
        
        <!-- Linked Trucks -->
        <h4 style="font-size:14px;font-weight:600;color:var(--green);margin-bottom:8px"><i class="fas fa-link"></i> Linked Vehicles (${linkedTrucks.length})</h4>
        ${linkedTrucks.length ? `<div class="table-wrap" style="margin-bottom:20px"><table class="data-table"><thead><tr>
          <th>App Truck</th><th>Verizon Vehicle</th><th>Plate</th><th>VIN</th><th>Make/Model</th><th>Year</th><th>Last Synced</th><th>Actions</th>
        </tr></thead><tbody>
          ${linkedTrucks.map(tk => {
            const vv = verizonVehicles.find(v => (v.VehicleId||v.Id) == tk.verizon_vehicle_id);
            return `<tr>
              <td><strong>${tk.name}</strong><br><span style="font-size:11px;color:var(--gray-500)">${tk.truck_type==='bale'?'Small':'Large'} · ${tk.zone_name||'No zone'}</span></td>
              <td><span style="font-weight:600;color:#7C3AED">${vv?.VehicleName||vv?.Name||tk.verizon_vehicle_number||'—'}</span><br><span style="font-size:11px;color:var(--gray-500)">#${tk.verizon_vehicle_number||'—'}</span></td>
              <td>${tk.license_plate||tk.plate_number||'—'}</td>
              <td style="font-size:11px;font-family:monospace">${tk.vin||'—'}</td>
              <td>${tk.make||''} ${tk.model||''}</td>
              <td>${tk.year||'—'}</td>
              <td style="font-size:11px">${tk.verizon_synced_at ? formatDate(tk.verizon_synced_at) : '—'}</td>
              <td><button class="btn btn-outline btn-sm" onclick="unlinkTruck(${tk.id})" title="Unlink"><i class="fas fa-unlink" style="color:var(--red)"></i></button></td>
            </tr>`;
          }).join('')}
        </tbody></table></div>` : '<p style="color:var(--gray-400);font-size:13px;margin-bottom:16px">No linked vehicles yet. Use Auto-Sync or link manually below.</p>'}
        
        <!-- Unlinked App Trucks -->
        ${unlinkedTrucks.length ? `<h4 style="font-size:14px;font-weight:600;color:var(--orange);margin-bottom:8px;margin-top:16px"><i class="fas fa-truck"></i> Unlinked App Trucks (${unlinkedTrucks.length})</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          ${unlinkedTrucks.map(tk => `<div class="card" style="padding:10px 14px;flex:0 0 auto;border-left:3px solid var(--orange)">
            <strong>${tk.name}</strong> <span style="font-size:11px;color:var(--gray-500)">(${tk.plate_number||'no plate'})</span>
            <div style="margin-top:6px">
              <select class="form-select" id="linkVehicle_${tk.id}" style="font-size:12px;padding:4px 8px;min-width:200px">
                <option value="">— Select Verizon Vehicle —</option>
                ${unlinkedVerizonVehicles.map(v => `<option value='${JSON.stringify({id:v.VehicleId||v.Id,number:v.VehicleNumber||v.Number,vin:v.VIN||v.Vin||'',make:v.Make||'',model:v.Model||'',year:v.Year||'',plate:v.RegistrationNumber||v.VehicleNumber||'',name:v.VehicleName||v.Name||''}).replace(/'/g,"&#39;")}'>${v.VehicleName||v.Name||v.VehicleNumber} (${v.VehicleNumber||v.Number})</option>`).join('')}
              </select>
              <button class="btn btn-sm" style="background:var(--navy);color:white;margin-top:4px" onclick="linkTruckToVerizon(${tk.id})"><i class="fas fa-link"></i> Link</button>
            </div>
          </div>`).join('')}
        </div>` : ''}
        
        <!-- Unlinked Verizon Vehicles -->
        ${unlinkedVerizonVehicles.length ? `<h4 style="font-size:14px;font-weight:600;color:#7C3AED;margin-bottom:8px;margin-top:16px"><i class="fas fa-satellite-dish"></i> Unlinked Verizon Vehicles (${unlinkedVerizonVehicles.length})</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${unlinkedVerizonVehicles.map(v => `<div class="card" style="padding:10px 14px;flex:0 0 auto;border-left:3px solid #7C3AED">
            <strong>${v.VehicleName||v.Name||'Unknown'}</strong>
            <div style="font-size:11px;color:var(--gray-500)">#${v.VehicleNumber||v.Number} · ${v.Make||''} ${v.Model||''} ${v.Year||''}</div>
            <div style="font-size:11px;font-family:monospace;color:var(--gray-400)">VIN: ${v.VIN||v.Vin||'—'}</div>
            <button class="btn btn-sm" style="background:#7C3AED;color:white;margin-top:6px" onclick="importVerizonVehicle(${JSON.stringify({id:v.VehicleId||v.Id,number:v.VehicleNumber||v.Number,name:v.VehicleName||v.Name||'',vin:v.VIN||v.Vin||'',make:v.Make||'',model:v.Model||'',year:v.Year||'',plate:v.RegistrationNumber||v.VehicleNumber||''}).replace(/"/g,'&quot;')})"><i class="fas fa-download"></i> Import as New Truck</button>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>

    <!-- DRIVERS SECTION -->
    <div class="card">
      <div class="card-body">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px"><i class="fas fa-id-card" style="color:var(--navy-light);margin-right:8px"></i> Driver Sync</h3>
        
        <!-- Linked Drivers -->
        <h4 style="font-size:14px;font-weight:600;color:var(--green);margin-bottom:8px"><i class="fas fa-link"></i> Linked Drivers (${linkedDrivers.length})</h4>
        ${linkedDrivers.length ? `<div class="table-wrap" style="margin-bottom:20px"><table class="data-table"><thead><tr>
          <th>App User</th><th>Role</th><th>Verizon Driver</th><th>Verizon ID</th><th>Last Synced</th><th>Actions</th>
        </tr></thead><tbody>
          ${linkedDrivers.map(d => {
            const vd = verizonDrivers.find(v => (v.DriverId||v.Id) == d.verizon_driver_id);
            return `<tr>
              <td><strong>${d.name}</strong><br><span style="font-size:11px;color:var(--gray-500)">${d.email||''}</span></td>
              <td>${statusBadge(d.role)}</td>
              <td>${vd ? `${vd.FirstName||''} ${vd.LastName||''}` : '—'}<br><span style="font-size:11px;color:var(--gray-500)">${vd?.EmailAddress||''}</span></td>
              <td style="font-family:monospace;font-size:12px">${d.verizon_driver_id||'—'}</td>
              <td style="font-size:11px">${d.verizon_synced_at ? formatDate(d.verizon_synced_at) : '—'}</td>
              <td><button class="btn btn-outline btn-sm" onclick="unlinkDriver(${d.id})" title="Unlink"><i class="fas fa-unlink" style="color:var(--red)"></i></button></td>
            </tr>`;
          }).join('')}
        </tbody></table></div>` : '<p style="color:var(--gray-400);font-size:13px;margin-bottom:16px">No linked drivers yet.</p>'}
        
        <!-- Unlinked App Users -->
        ${unlinkedDrivers.length ? `<h4 style="font-size:14px;font-weight:600;color:var(--orange);margin-bottom:8px;margin-top:16px"><i class="fas fa-user"></i> Unlinked App Users (${unlinkedDrivers.length})</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          ${unlinkedDrivers.map(d => `<div class="card" style="padding:10px 14px;flex:0 0 auto;border-left:3px solid var(--orange)">
            <strong>${d.name}</strong> <span class="badge badge-${d.role}">${d.role}</span>
            <div style="font-size:11px;color:var(--gray-500)">${d.email||''} · ${d.phone||''}</div>
            <div style="margin-top:6px">
              <select class="form-select" id="linkDriver_${d.id}" style="font-size:12px;padding:4px 8px;min-width:220px">
                <option value="">— Select Verizon Driver —</option>
                ${unlinkedVerizonDrivers.map(vd => `<option value='${JSON.stringify({id:vd.DriverId||vd.Id,number:vd.DriverNumber||vd.Number||String(vd.DriverId||vd.Id)}).replace(/'/g,"&#39;")}'>${vd.FirstName||''} ${vd.LastName||''} (${vd.EmailAddress||'no email'})</option>`).join('')}
              </select>
              <button class="btn btn-sm" style="background:var(--navy);color:white;margin-top:4px" onclick="linkDriverToVerizon(${d.id})"><i class="fas fa-link"></i> Link</button>
            </div>
          </div>`).join('')}
        </div>` : ''}
        
        <!-- Unlinked Verizon Drivers -->
        ${unlinkedVerizonDrivers.length ? `<h4 style="font-size:14px;font-weight:600;color:#7C3AED;margin-bottom:8px;margin-top:16px"><i class="fas fa-satellite-dish"></i> Unlinked Verizon Drivers (${unlinkedVerizonDrivers.length})</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${unlinkedVerizonDrivers.map(vd => `<div class="card" style="padding:10px 14px;flex:0 0 auto;border-left:3px solid #7C3AED">
            <strong>${vd.FirstName||''} ${vd.LastName||''}</strong>
            <div style="font-size:11px;color:var(--gray-500)">${vd.EmailAddress||'No email'} · ${vd.PhoneNumber||''}</div>
            <button class="btn btn-sm" style="background:#7C3AED;color:white;margin-top:6px" onclick="importVerizonDriver(${JSON.stringify({id:vd.DriverId||vd.Id,name:(vd.FirstName||'')+' '+(vd.LastName||''),email:vd.EmailAddress||'',phone:vd.PhoneNumber||''}).replace(/"/g,'&quot;')})"><i class="fas fa-user-plus"></i> Import as New Driver</button>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
}

async function runAutoSync() {
  try {
    showToast('Running auto-sync...', 'info');
    const { data } = await API.post('/sync/auto');
    if (data.success) {
      const r = data.results;
      showToast(`Auto-sync complete: ${r.trucksLinked} trucks linked, ${r.driversLinked} drivers linked, ${r.trucksUpdated} trucks updated${r.errors.length ? '. Errors: ' + r.errors.join('; ') : ''}`, r.errors.length ? 'warning' : 'success');
    } else {
      showToast('Auto-sync failed: ' + (data.error || 'Unknown error'), 'error');
    }
    renderFleetSync();
  } catch (e) { showToast('Auto-sync failed: ' + e.message, 'error'); }
}

async function refreshVerizonVehicles() {
  try {
    showToast('Refreshing vehicle data from Verizon...', 'info');
    const { data } = await API.post('/sync/refresh-vehicles');
    showToast(`Refreshed ${data.updated}/${data.total} linked vehicles`, 'success');
    renderFleetSync();
  } catch (e) { showToast('Refresh failed: ' + e.message, 'error'); }
}

async function linkTruckToVerizon(truckId) {
  const sel = document.getElementById('linkVehicle_' + truckId);
  if (!sel || !sel.value) { showToast('Select a Verizon vehicle first', 'warning'); return; }
  try {
    const v = JSON.parse(sel.value);
    await API.post('/sync/link-truck', {
      truckId, verizonVehicleId: v.id, verizonVehicleNumber: v.number,
      vin: v.vin || null, make: v.make || null, model: v.model || null,
      year: v.year || null, licensePlate: v.plate || null
    });
    showToast('Truck linked to Verizon vehicle!', 'success');
    renderFleetSync();
  } catch (e) { showToast('Link failed: ' + e.message, 'error'); }
}

async function unlinkTruck(truckId) {
  if (!confirm('Unlink this truck from Verizon? The truck will remain in the app.')) return;
  try {
    await API.post('/sync/unlink-truck', { truckId });
    showToast('Truck unlinked from Verizon', 'success');
    renderFleetSync();
  } catch (e) { showToast('Unlink failed: ' + e.message, 'error'); }
}

async function linkDriverToVerizon(userId) {
  const sel = document.getElementById('linkDriver_' + userId);
  if (!sel || !sel.value) { showToast('Select a Verizon driver first', 'warning'); return; }
  try {
    const v = JSON.parse(sel.value);
    await API.post('/sync/link-driver', { userId, verizonDriverId: v.id, verizonDriverNumber: v.number });
    showToast('Driver linked to Verizon!', 'success');
    renderFleetSync();
  } catch (e) { showToast('Link failed: ' + e.message, 'error'); }
}

async function unlinkDriver(userId) {
  if (!confirm('Unlink this user from Verizon? The user will remain in the app.')) return;
  try {
    await API.post('/sync/unlink-driver', { userId });
    showToast('Driver unlinked from Verizon', 'success');
    renderFleetSync();
  } catch (e) { showToast('Unlink failed: ' + e.message, 'error'); }
}

async function importVerizonVehicle(vData) {
  const v = typeof vData === 'string' ? JSON.parse(vData) : vData;
  const name = prompt('Truck name for the app:', v.name || '');
  if (!name) return;
  try {
    await API.post('/sync/import-truck', {
      verizonVehicleId: v.id, verizonVehicleNumber: v.number, name,
      vin: v.vin || null, make: v.make || null, model: v.model || null,
      year: v.year || null, licensePlate: v.plate || null,
      truckType: (v.name||'').toLowerCase().includes('small') ? 'bale' : 'pallet'
    });
    showToast(`Truck "${name}" imported and linked!`, 'success');
    renderFleetSync();
  } catch (e) { showToast('Import failed: ' + e.message, 'error'); }
}

async function importVerizonDriver(vData) {
  const v = typeof vData === 'string' ? JSON.parse(vData) : vData;
  const name = prompt('Driver name for the app:', v.name?.trim() || '');
  if (!name) return;
  try {
    const resp = await API.post('/sync/import-driver', {
      verizonDriverId: v.id, name, email: v.email || null, phone: v.phone || null, role: 'driver'
    });
    if (resp.data.success) {
      showToast(`Driver "${name}" imported and linked!`, 'success');
    } else {
      showToast('Import failed: ' + (resp.data.error || 'Unknown'), 'error');
    }
    renderFleetSync();
  } catch (e) {
    if (e.response?.status === 409) {
      showToast('A user with this email already exists. Link them manually instead.', 'warning');
    } else {
      showToast('Import failed: ' + e.message, 'error');
    }
  }
}

// ==================== FLEET TRACKING (Verizon Connect Reveal) ====================
var fleetTrackingData = { vehicles: [], drivers: [], locations: [], configured: false };
var fleetTrackingMap = null;
var fleetTrackingMarkers = [];
var fleetTrackingInterval = null;
var fleetSelectedVehicle = null;
var fleetSegmentsDate = null;

async function renderFleetTracking() {
  const pc = document.getElementById('pageContent');
  if (!pc) return;

  // Check config first
  try {
    const cfg = await API.get('/verizon/config');
    if (!cfg.data.configured) {
      pc.innerHTML = `
        <div class="card" style="max-width:700px;margin:40px auto;padding:48px;text-align:center">
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#EF4444,#DC2626);display:flex;align-items:center;justify-content:center;margin:0 auto 24px">
            <i class="fas fa-satellite-dish" style="font-size:36px;color:white"></i>
          </div>
          <h2 style="font-size:24px;font-weight:700;color:var(--navy);margin-bottom:12px">Verizon Connect Setup Required</h2>
          <p style="color:var(--gray-500);margin-bottom:24px;line-height:1.6">${cfg.data.message}</p>
          <div class="card" style="background:var(--gray-50);padding:24px;text-align:left;margin-bottom:24px">
            <h4 style="font-weight:700;margin-bottom:12px"><i class="fas fa-cog"></i> Configuration Steps</h4>
            <ol style="margin:0;padding-left:20px;line-height:2">
              <li>${cfg.data.hasCredentials ? '<span style="color:#059669"><i class="fas fa-check-circle"></i> Credentials configured</span>' : '<span style="color:#DC2626">Add <code>VERIZON_USERNAME</code> and <code>VERIZON_PASSWORD</code></span>'}</li>
              <li>${cfg.data.hasAppId ? '<span style="color:#059669"><i class="fas fa-check-circle"></i> App ID configured</span>' : '<span style="color:#DC2626">Register at <a href="https://fim.us.fleetmatics.com" target="_blank" style="color:#2563EB">fim.us.fleetmatics.com</a> and add <code>VERIZON_APP_ID</code></span>'}</li>
              <li>Deploy with: <code>wrangler pages secret put VERIZON_APP_ID</code></li>
            </ol>
          </div>
          <button class="btn btn-primary" onclick="renderFleetTracking()"><i class="fas fa-refresh"></i> Retry Connection</button>
        </div>`;
      return;
    }
  } catch (e) {
    pc.innerHTML = `<div class="card" style="padding:40px;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--orange);margin-bottom:12px"></i><h3>Failed to check Verizon config</h3><p style="color:var(--gray-500)">${e.message}</p><button class="btn btn-primary" onclick="renderFleetTracking()"><i class="fas fa-redo"></i> Retry</button></div>`;
    return;
  }

  pc.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-primary" onclick="fleetRefreshAll()" id="fleetRefreshBtn"><i class="fas fa-sync-alt"></i> Refresh</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="fleetAutoRefresh" onchange="fleetToggleAutoRefresh(this.checked)"> Auto-refresh (60s)
      </label>
      <span id="fleetLastUpdate" style="font-size:12px;color:var(--gray-400);margin-left:auto"></span>
    </div>

    <!-- Stats Cards -->
    <div id="fleetStatsRow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
      <div class="card" style="padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:var(--navy)" id="fleetStatVehicles">-</div>
        <div style="font-size:12px;color:var(--gray-500)"><i class="fas fa-truck" style="color:#2563EB"></i> Vehicles</div>
      </div>
      <div class="card" style="padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#059669" id="fleetStatMoving">-</div>
        <div style="font-size:12px;color:var(--gray-500)"><i class="fas fa-road" style="color:#059669"></i> Moving</div>
      </div>
      <div class="card" style="padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#D97706" id="fleetStatStopped">-</div>
        <div style="font-size:12px;color:var(--gray-500)"><i class="fas fa-parking" style="color:#D97706"></i> Stopped</div>
      </div>
      <div class="card" style="padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:var(--navy)" id="fleetStatDrivers">-</div>
        <div style="font-size:12px;color:var(--gray-500)"><i class="fas fa-id-card" style="color:#7C3AED"></i> Drivers</div>
      </div>
    </div>

    <!-- Map + Vehicle List -->
    <div style="display:grid;grid-template-columns:1fr 380px;gap:20px;margin-bottom:24px" id="fleetMainGrid">
      <div class="card" style="padding:0;overflow:hidden">
        <div id="fleetTrackingMap" style="width:100%;height:500px;background:var(--gray-100);display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:var(--gray-400)"><i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><br>Loading map...</div>
        </div>
      </div>
      <div class="card" style="padding:0;max-height:500px;overflow-y:auto" id="fleetVehicleList">
        <div style="padding:16px;border-bottom:1px solid var(--gray-100);position:sticky;top:0;background:white;z-index:1">
          <input type="text" class="form-input" placeholder="Search vehicles..." oninput="fleetFilterVehicles(this.value)" style="font-size:13px">
        </div>
        <div id="fleetVehicleListBody" style="padding:8px">
          <div style="text-align:center;padding:40px;color:var(--gray-400)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
        </div>
      </div>
    </div>

    <!-- Vehicle Detail / Segments Panel -->
    <div id="fleetDetailPanel" style="display:none" class="card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <button class="btn btn-outline btn-sm" onclick="fleetCloseDetail()"><i class="fas fa-arrow-left"></i></button>
        <h3 id="fleetDetailTitle" style="font-weight:700;color:var(--navy);margin:0"></h3>
        <span id="fleetDetailStatus" style="margin-left:auto"></span>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <input type="date" id="fleetSegmentDate" class="form-input" style="width:auto" onchange="fleetLoadSegments()">
        <button class="btn btn-sm btn-outline" onclick="fleetLoadSegments()"><i class="fas fa-route"></i> Load Trips</button>
      </div>
      <div id="fleetDetailBody">
        <div style="text-align:center;padding:20px;color:var(--gray-400)">Select a vehicle to see details</div>
      </div>
    </div>
  `;

  // Set default date for segments
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('fleetSegmentDate');
  if (dateInput) dateInput.value = today;
  fleetSegmentsDate = today;

  // Make grid responsive
  if (window.innerWidth < 900) {
    const grid = document.getElementById('fleetMainGrid');
    if (grid) grid.style.gridTemplateColumns = '1fr';
  }

  fleetRefreshAll();
}

async function fleetRefreshAll() {
  const btn = document.getElementById('fleetRefreshBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...'; }

  try {
    const resp = await API.get('/verizon/dashboard');
    const d = resp.data;
    fleetTrackingData = { vehicles: d.vehicles || [], drivers: d.drivers || [], locations: d.locations || [], configured: true };

    // Update stats
    const moving = d.locations.filter(l => l && !l.error && (l.Speed > 0 || l.speed > 0 || l.IsMoving || l.isMoving)).length;
    const stopped = d.locations.filter(l => l && !l.error).length - moving;
    document.getElementById('fleetStatVehicles').textContent = d.vehicles.length;
    document.getElementById('fleetStatMoving').textContent = moving;
    document.getElementById('fleetStatStopped').textContent = stopped;
    document.getElementById('fleetStatDrivers').textContent = d.drivers.length;
    document.getElementById('fleetLastUpdate').textContent = 'Updated: ' + new Date().toLocaleTimeString();

    fleetRenderVehicleList();
    fleetRenderMap();
  } catch (e) {
    showToast('Failed to load fleet data: ' + (e.response?.data?.error || e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh'; }
  }
}

function fleetToggleAutoRefresh(enabled) {
  if (fleetTrackingInterval) { clearInterval(fleetTrackingInterval); fleetTrackingInterval = null; }
  if (enabled) {
    fleetTrackingInterval = setInterval(() => { if (currentPage === 'fleet_tracking') fleetRefreshAll(); }, 60000);
  }
}

function fleetFilterVehicles(query) {
  const q = query.toLowerCase();
  const items = document.querySelectorAll('.fleet-vehicle-item');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? '' : 'none';
  });
}

function fleetRenderVehicleList() {
  const body = document.getElementById('fleetVehicleListBody');
  if (!body) return;

  if (fleetTrackingData.vehicles.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)"><i class="fas fa-truck" style="font-size:24px;margin-bottom:8px"></i><br>No vehicles found</div>';
    return;
  }

  const locMap = {};
  fleetTrackingData.locations.forEach(l => { if (l) locMap[l.vehicleNumber || l.VehicleNumber] = l; });

  body.innerHTML = fleetTrackingData.vehicles.map(v => {
    const vn = v.VehicleNumber || v.Number || '';
    const name = v.VehicleName || v.Name || vn;
    const loc = locMap[vn];
    const isMoving = loc && !loc.error && (loc.Speed > 0 || loc.speed > 0 || loc.IsMoving || loc.isMoving);
    const speed = loc ? (loc.Speed || loc.speed || 0) : 0;
    const lat = loc ? (loc.Latitude || loc.latitude || loc.Lat || loc.lat) : null;
    const lng = loc ? (loc.Longitude || loc.longitude || loc.Lon || loc.lng || loc.Long) : null;
    const heading = loc ? (loc.Heading || loc.heading || loc.BearingDegrees || 0) : 0;
    const addr = loc ? (loc.AddressLine1 || loc.Address || loc.FormattedAddress || '') : '';
    const statusColor = isMoving ? '#059669' : (loc && !loc.error ? '#D97706' : '#9CA3AF');
    const statusText = isMoving ? 'Moving' : (loc && !loc.error ? 'Stopped' : 'Unknown');
    const selected = fleetSelectedVehicle === vn ? 'background:var(--blue-50);border-color:var(--blue-500)' : '';

    return `<div class="fleet-vehicle-item" onclick="fleetSelectVehicle('${vn}','${name.replace(/'/g,'\\\'')}')" style="padding:12px;border:1px solid var(--gray-100);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.15s;${selected}">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:8px;background:${isMoving?'#ECFDF5':'#FFF7ED'};display:flex;align-items:center;justify-content:center">
          <i class="fas ${isMoving?'fa-truck-moving':'fa-truck'}" style="color:${statusColor}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
          <div style="font-size:11px;color:var(--gray-400)">${vn}</div>
        </div>
        <div style="text-align:right">
          <span class="badge" style="font-size:10px;background:${statusColor}15;color:${statusColor};padding:2px 8px;border-radius:10px;font-weight:600">${statusText}</span>
          ${speed > 0 ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">${Math.round(speed)} mph</div>` : ''}
        </div>
      </div>
      ${addr ? `<div style="font-size:11px;color:var(--gray-400);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="fas fa-map-marker-alt" style="color:#EF4444"></i> ${addr}</div>` : ''}
    </div>`;
  }).join('');
}

function fleetRenderMap() {
  const mapDiv = document.getElementById('fleetTrackingMap');
  if (!mapDiv || !window.__gmapsLoaded) {
    if (mapDiv) mapDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)"><i class="fas fa-map" style="font-size:24px;margin-bottom:8px"></i><br>Google Maps loading...<br><span style="font-size:11px">Map will appear when Maps API is ready</span></div>';
    // Retry after a second
    setTimeout(() => { if (currentPage === 'fleet_tracking' && window.__gmapsLoaded) fleetRenderMap(); }, 2000);
    return;
  }

  // Initialize map if not created
  if (!fleetTrackingMap) {
    fleetTrackingMap = new google.maps.Map(mapDiv, {
      center: { lat: 26.7045, lng: -80.2048 }, // Depot
      zoom: 11,
      mapTypeControl: true,
      streetViewControl: false,
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
    });
  }

  // Clear old markers
  fleetTrackingMarkers.forEach(m => m.setMap(null));
  fleetTrackingMarkers = [];

  const bounds = new google.maps.LatLngBounds();
  let hasPoints = false;

  fleetTrackingData.locations.forEach(loc => {
    if (!loc || loc.error) return;
    const lat = loc.Latitude || loc.latitude || loc.Lat || loc.lat;
    const lng = loc.Longitude || loc.longitude || loc.Lon || loc.lng || loc.Long;
    if (!lat || !lng) return;

    const isMoving = loc.Speed > 0 || loc.speed > 0 || loc.IsMoving || loc.isMoving;
    const speed = loc.Speed || loc.speed || 0;
    const name = loc.vehicleName || loc.VehicleName || loc.vehicleNumber || loc.VehicleNumber || 'Unknown';
    const vn = loc.vehicleNumber || loc.VehicleNumber;
    const heading = loc.Heading || loc.heading || loc.BearingDegrees || 0;

    const pos = { lat: parseFloat(lat), lng: parseFloat(lng) };
    bounds.extend(pos);
    hasPoints = true;

    const marker = new google.maps.Marker({
      position: pos,
      map: fleetTrackingMap,
      title: `${name} (${vn})`,
      icon: {
        path: isMoving ? google.maps.SymbolPath.FORWARD_CLOSED_ARROW : google.maps.SymbolPath.CIRCLE,
        scale: isMoving ? 7 : 8,
        fillColor: isMoving ? '#059669' : '#D97706',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
        rotation: heading,
      },
      zIndex: isMoving ? 10 : 5,
    });

    const addr = loc.AddressLine1 || loc.Address || loc.FormattedAddress || '';
    const infoContent = `<div style="font-family:Inter,sans-serif;padding:4px;min-width:200px">
      <div style="font-weight:700;font-size:14px;color:#1E3A8A;margin-bottom:4px">${name}</div>
      <div style="font-size:12px;color:#6B7280;margin-bottom:6px">Vehicle: ${vn}</div>
      <div style="display:flex;gap:12px;font-size:12px">
        <span><strong>Status:</strong> ${isMoving?'<span style="color:#059669">Moving</span>':'<span style="color:#D97706">Stopped</span>'}</span>
        ${speed > 0 ? `<span><strong>Speed:</strong> ${Math.round(speed)} mph</span>` : ''}
      </div>
      ${addr ? `<div style="font-size:11px;color:#9CA3AF;margin-top:4px"><i class="fas fa-map-marker-alt" style="color:#EF4444"></i> ${addr}</div>` : ''}
      <div style="margin-top:8px"><button onclick="fleetSelectVehicle('${vn}','${name.replace(/'/g,'\\\'')}')" style="font-size:11px;background:#2563EB;color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer">View Trips</button></div>
    </div>`;

    const infoWindow = new google.maps.InfoWindow({ content: infoContent });
    marker.addListener('click', () => { infoWindow.open(fleetTrackingMap, marker); });
    fleetTrackingMarkers.push(marker);
  });

  if (hasPoints) fleetTrackingMap.fitBounds(bounds, { padding: 50 });
}

async function fleetSelectVehicle(vehicleNumber, vehicleName) {
  fleetSelectedVehicle = vehicleNumber;
  fleetRenderVehicleList(); // highlight

  const panel = document.getElementById('fleetDetailPanel');
  const title = document.getElementById('fleetDetailTitle');
  const body = document.getElementById('fleetDetailBody');
  if (!panel || !title || !body) return;

  panel.style.display = '';
  title.innerHTML = `<i class="fas fa-truck" style="color:#2563EB"></i> ${vehicleName} <span style="font-size:12px;color:var(--gray-400)">(${vehicleNumber})</span>`;

  // Find location for status
  const loc = fleetTrackingData.locations.find(l => l && (l.vehicleNumber === vehicleNumber || l.VehicleNumber === vehicleNumber));
  const statusEl = document.getElementById('fleetDetailStatus');
  if (statusEl && loc && !loc.error) {
    const isMoving = loc.Speed > 0 || loc.speed > 0 || loc.IsMoving || loc.isMoving;
    statusEl.innerHTML = `<span class="badge" style="background:${isMoving?'#05966915':'#D9770615'};color:${isMoving?'#059669':'#D97706'};padding:4px 12px;border-radius:12px;font-weight:600">${isMoving?'Moving':'Stopped'}</span>`;
  }

  // Center map on this vehicle
  if (loc && fleetTrackingMap) {
    const lat = loc.Latitude || loc.latitude || loc.Lat || loc.lat;
    const lng = loc.Longitude || loc.longitude || loc.Lon || loc.lng || loc.Long;
    if (lat && lng) fleetTrackingMap.setCenter({ lat: parseFloat(lat), lng: parseFloat(lng) });
    fleetTrackingMap.setZoom(14);
  }

  body.innerHTML = '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i> Loading vehicle details...</div>';

  // Load vehicle info + segments
  try {
    const dateInput = document.getElementById('fleetSegmentDate');
    const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    const [infoResp, segResp] = await Promise.allSettled([
      API.get(`/verizon/vehicles/${encodeURIComponent(vehicleNumber)}`),
      API.get(`/verizon/vehicles/${encodeURIComponent(vehicleNumber)}/segments?date=${date}`)
    ]);

    const vInfo = infoResp.status === 'fulfilled' ? infoResp.value.data : null;
    const segments = segResp.status === 'fulfilled' ? segResp.value.data : [];
    const allSegs = Array.isArray(segments) ? segments.flatMap(s => s.Segments || s.segments || [s]) : [];

    let totalDist = 0;
    let totalTrips = 0;
    allSegs.forEach(seg => {
      if (seg.DistanceKilometers || seg.distanceKilometers) {
        totalDist += (seg.DistanceKilometers || seg.distanceKilometers) * 0.621371; // km to mi
        totalTrips++;
      }
    });

    body.innerHTML = `
      <!-- Vehicle Info -->
      ${vInfo ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
        ${vInfo.VehicleName||vInfo.Name ? `<div class="card" style="padding:12px;background:var(--gray-50)"><div style="font-size:11px;color:var(--gray-400)">Name</div><div style="font-weight:600;font-size:14px">${vInfo.VehicleName||vInfo.Name}</div></div>` : ''}
        ${vInfo.Make ? `<div class="card" style="padding:12px;background:var(--gray-50)"><div style="font-size:11px;color:var(--gray-400)">Make/Model</div><div style="font-weight:600;font-size:14px">${vInfo.Make} ${vInfo.Model||''} ${vInfo.Year||''}</div></div>` : ''}
        ${vInfo.VIN || vInfo.Vin ? `<div class="card" style="padding:12px;background:var(--gray-50)"><div style="font-size:11px;color:var(--gray-400)">VIN</div><div style="font-weight:600;font-size:12px;word-break:break-all">${vInfo.VIN||vInfo.Vin}</div></div>` : ''}
        ${vInfo.RegistrationNumber ? `<div class="card" style="padding:12px;background:var(--gray-50)"><div style="font-size:11px;color:var(--gray-400)">Registration</div><div style="font-weight:600;font-size:14px">${vInfo.RegistrationNumber}</div></div>` : ''}
      </div>` : ''}

      <!-- Trip Summary -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px">
        <div class="card" style="padding:16px;text-align:center;background:linear-gradient(135deg,#EFF6FF,#DBEAFE)">
          <div style="font-size:24px;font-weight:800;color:#2563EB">${totalTrips}</div>
          <div style="font-size:11px;color:#3B82F6">Trips Today</div>
        </div>
        <div class="card" style="padding:16px;text-align:center;background:linear-gradient(135deg,#F0FDF4,#DCFCE7)">
          <div style="font-size:24px;font-weight:800;color:#059669">${totalDist.toFixed(1)}</div>
          <div style="font-size:11px;color:#10B981">Miles Today</div>
        </div>
      </div>

      <!-- Segments Table -->
      <h4 style="font-weight:700;color:var(--navy);margin-bottom:12px"><i class="fas fa-route" style="color:#2563EB"></i> Trip Segments — ${date}</h4>
      ${allSegs.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--gray-400)">No trip segments found for this date</div>' :
      `<div style="overflow-x:auto"><table class="data-table" style="width:100%">
        <thead><tr>
          <th>#</th><th>Start Time</th><th>Start Location</th><th>End Time</th><th>End Location</th><th>Distance</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${allSegs.map((seg, i) => {
            const startTime = seg.StartDateUtc || seg.startDateUtc || '';
            const endTime = seg.EndDateUtc || seg.endDateUtc || '';
            const startLoc = seg.StartLocation || seg.startLocation || {};
            const endLoc = seg.EndLocation || seg.endLocation || {};
            const dist = (seg.DistanceKilometers || seg.distanceKilometers || 0) * 0.621371;
            const isComplete = seg.IsComplete !== false && seg.isComplete !== false;
            const startAddr = [startLoc.AddressLine1, startLoc.Locality, startLoc.AdministrativeArea].filter(Boolean).join(', ') || `${(startLoc.Latitude||'?')}, ${(startLoc.Longitude||'?')}`;
            const endAddr = [endLoc.AddressLine1, endLoc.Locality, endLoc.AdministrativeArea].filter(Boolean).join(', ') || (isComplete ? `${(endLoc.Latitude||'?')}, ${(endLoc.Longitude||'?')}` : '—');
            const fmtTime = (t) => t ? new Date(t + 'Z').toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
            return `<tr>
              <td>${i+1}</td>
              <td style="white-space:nowrap">${fmtTime(startTime)}</td>
              <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${startAddr}">${startAddr}</td>
              <td style="white-space:nowrap">${fmtTime(endTime)}</td>
              <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${endAddr}">${endAddr}</td>
              <td>${dist.toFixed(1)} mi</td>
              <td><span class="badge" style="background:${isComplete?'#05966915':'#D9770615'};color:${isComplete?'#059669':'#D97706'};font-size:10px">${isComplete?'Complete':'In Progress'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`}
    `;
  } catch (e) {
    body.innerHTML = `<div class="scan-result-banner error">Failed to load vehicle details: ${e.message}</div>`;
  }
}

async function fleetLoadSegments() {
  const dateInput = document.getElementById('fleetSegmentDate');
  if (!dateInput || !fleetSelectedVehicle) return;
  // Find vehicle name from stored data
  const v = fleetTrackingData.vehicles.find(v => (v.VehicleNumber||v.Number) === fleetSelectedVehicle);
  const name = v ? (v.VehicleName||v.Name||fleetSelectedVehicle) : fleetSelectedVehicle;
  await fleetSelectVehicle(fleetSelectedVehicle, name);
}

function fleetCloseDetail() {
  fleetSelectedVehicle = null;
  const panel = document.getElementById('fleetDetailPanel');
  if (panel) panel.style.display = 'none';
  fleetRenderVehicleList();
  // Reset map zoom
  if (fleetTrackingMap && fleetTrackingData.locations.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    fleetTrackingData.locations.forEach(loc => {
      if (!loc || loc.error) return;
      const lat = loc.Latitude || loc.latitude || loc.Lat || loc.lat;
      const lng = loc.Longitude || loc.longitude || loc.Lon || loc.lng || loc.Long;
      if (lat && lng) bounds.extend({ lat: parseFloat(lat), lng: parseFloat(lng) });
    });
    fleetTrackingMap.fitBounds(bounds, { padding: 50 });
  }
}

// Clean up when navigating away
var _origNavigate = window.navigate;
if (typeof _origNavigate === 'function') {
  window.navigate = function(page, params) {
    if (currentPage === 'fleet_tracking' && page !== 'fleet_tracking') {
      // Clean up map and interval
      if (fleetTrackingInterval) { clearInterval(fleetTrackingInterval); fleetTrackingInterval = null; }
      fleetTrackingMap = null;
      fleetTrackingMarkers = [];
    }
    _origNavigate(page, params);
  };
}

// ==================== INIT (exposed for parent shell) ====================
window._logisticsInit = function() {
  // Read auth from parent shell's localStorage bridge
  const savedUser = localStorage.getItem('bf_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      if (currentUser.role === 'driver') currentPage = 'driver';
    } catch (e) { clearToken(); }
  }
  render();
  // Initialize scan queue (restores from localStorage if there are saved items)
  sqInit();
};

// ==================== TICKET REVIEW PAGE (QuickBooks-style split screen) ====================

async function renderTicketReview() {
  const pc = document.getElementById('pageContent');
  const sq = window._scanQueue;

  // Make sure scan queue is initialized
  sqInit();

  // Fetch customers & products for dropdowns (cache in window)
  if (!window._custList || !window._custList.length) {
    try { const r = await API.get('/customers'); window._custList = r.data.customers || []; } catch(e) {}
  }
  if (!window._prodList || !window._prodList.length) {
    try { const r = await API.get('/products'); window._prodList = r.data.products || []; } catch(e) {}
  }

  // Get reviewable items (ready or error)
  const reviewable = sq.items.filter(i => i.status === 'ready' || i.status === 'error');
  const scanning = sq.items.filter(i => i.status === 'scanning' || i.status === 'queued');
  const selectedIdx = window._trSelectedIdx || 0;

  pc.innerHTML = `
    <div class="filters-bar no-print" style="flex-wrap:wrap;gap:8px">
      <h3 style="font-weight:700;font-size:16px"><i class="fas fa-rectangle-list" style="color:var(--orange);margin-right:8px"></i>Ticket Review</h3>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        ${scanning.length > 0 ? `<span style="font-size:13px;color:var(--orange)"><i class="fas fa-circle-notch fa-spin"></i> ${scanning.length} scanning...</span>` : ''}
        <span style="font-size:13px;color:var(--gray-500)">${reviewable.length} ticket${reviewable.length !== 1 ? 's' : ''} to review</span>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden">
          <i class="fas fa-plus"></i> Add Tickets
          <input type="file" accept="*/*" multiple style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="trAddFiles(event)">
        </label>
        <button class="btn btn-outline btn-sm" onclick="trStartCamera()"><i class="fas fa-camera"></i></button>
      </div>
    </div>

    <div id="trContent">
      ${reviewable.length === 0 && scanning.length === 0 ? trEmptyState() : ''}
      ${reviewable.length === 0 && scanning.length > 0 ? trScanningState(scanning) : ''}
      ${reviewable.length > 0 ? trSplitView(reviewable, selectedIdx) : ''}
    </div>
  `;

  // Load addresses if a customer is pre-selected
  if (reviewable.length > 0) {
    const item = reviewable[Math.min(selectedIdx, reviewable.length - 1)];
    if (item.result?.customer_id) {
      trLoadAddresses(item.result.customer_id, item.result?.delivery_address);
    }
  }

  // Set up auto-refresh when scanning
  if (scanning.length > 0) {
    window._trRefreshTimer = setTimeout(() => {
      if (currentPage === 'ticket_review') renderTicketReview();
    }, 3000);
  }
}

function trEmptyState() {
  return `
    <div class="card" style="padding:60px;text-align:center">
      <div style="font-size:48px;color:var(--gray-300);margin-bottom:16px"><i class="fas fa-inbox"></i></div>
      <h3 style="color:var(--gray-600);margin-bottom:8px">No tickets to review</h3>
      <p style="color:var(--gray-400);margin-bottom:20px;font-size:14px">Upload ticket photos to scan them with AI and create orders</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <label class="btn btn-primary" style="cursor:pointer;margin:0;position:relative;overflow:hidden">
          <i class="fas fa-upload"></i> Upload Ticket Photos
          <input type="file" accept="*/*" multiple style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="trAddFiles(event)">
        </label>
        <button class="btn btn-outline" onclick="trStartCamera()"><i class="fas fa-camera"></i> Take Photo</button>
      </div>
    </div>`;
}

function trScanningState(scanning) {
  return `
    <div class="card" style="padding:40px;text-align:center">
      <div style="font-size:40px;color:var(--orange);margin-bottom:16px"><i class="fas fa-cog fa-spin"></i></div>
      <h3 style="color:var(--gray-600);margin-bottom:8px">Scanning ${scanning.length} ticket${scanning.length !== 1 ? 's' : ''}...</h3>
      <p style="color:var(--gray-400);font-size:14px">AI is extracting order details. This page will update automatically.</p>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:20px;flex-wrap:wrap">
        ${scanning.map(item => `
          <div style="width:80px;text-align:center">
            <div style="width:64px;height:64px;border-radius:10px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;margin:0 auto 6px">
              ${item.thumbnail ? `<img src="${item.thumbnail}" style="width:64px;height:64px;object-fit:cover;border-radius:10px">` : '<i class="fas fa-image" style="font-size:24px;color:var(--gray-300)"></i>'}
            </div>
            <div style="font-size:11px;color:var(--orange);font-weight:600"><i class="fas fa-circle-notch fa-spin"></i> ${item.status === 'queued' ? 'Queued' : 'Scanning'}</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:20px">
        <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;position:relative;overflow:hidden">
          <i class="fas fa-plus"></i> Add More
          <input type="file" accept="*/*" multiple style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="trAddFiles(event)">
        </label>
      </div>
    </div>`;
}

function trSplitView(reviewable, selectedIdx) {
  const idx = Math.min(selectedIdx, reviewable.length - 1);
  const item = reviewable[idx];
  const result = item.result || {};
  const isError = item.status === 'error';

  // Ticket thumbnails strip
  const strip = reviewable.map((r, i) => {
    const isActive = i === idx;
    const icon = r.status === 'ready' ? 'fa-check-circle' : 'fa-exclamation-circle';
    const iconColor = r.status === 'ready' ? 'var(--green)' : 'var(--red)';
    return `<div onclick="trSelectTicket(${i})" style="cursor:pointer;flex-shrink:0;position:relative;border:2px solid ${isActive ? 'var(--navy)' : 'transparent'};border-radius:10px;overflow:hidden;width:56px;height:56px;transition:border 0.2s">
      <img src="${r.thumbnail}" style="width:56px;height:56px;object-fit:cover;display:block;${!isActive ? 'opacity:0.6' : ''}">
      <i class="fas ${icon}" style="position:absolute;bottom:2px;right:2px;font-size:12px;color:${iconColor};background:white;border-radius:50%;padding:1px"></i>
    </div>`;
  }).join('');

  // Customer dropdown
  const customers = window._custList || [];
  const matchedCustId = result.customer_id || '';
  const custOpts = customers.map(c =>
    `<option value="${c.id}" ${c.id == matchedCustId ? 'selected' : ''}>${c.business_name}</option>`
  ).join('');
  const newCustOpt = !matchedCustId && result.customer_name
    ? `<option value="__new__" selected>+ New: ${escapeHtml(result.customer_name)}</option>` : '';

  // Items
  const items = result.items || [];
  const products = window._prodList || [];
  const itemRows = items.map((itm, i) => {
    const prod = itm.product_id ? products.find(p => p.id === itm.product_id) : null;
    const name = prod ? prod.name : (itm.product_name || 'Unknown product');
    const sku = prod ? prod.sku : (itm.sku || '');
    const unit = prod ? (prod.unit_type || 'bag') : (itm.unit || 'bag');
    return `<tr>
      <td style="max-width:180px"><strong style="font-size:13px">${escapeHtml(name)}</strong>${sku ? '<br><code style="font-size:10px;color:var(--gray-400)">' + escapeHtml(sku) + '</code>' : ''}</td>
      <td><input type="number" class="form-input" value="${itm.quantity || 1}" min="1" style="width:65px;font-size:13px" id="trQty_${i}"></td>
      <td style="font-size:12px;color:var(--gray-500)">${unit}</td>
    </tr>`;
  }).join('');

  const confPct = Math.round((result.confidence || 0) * 100);
  const confClass = confPct >= 70 ? 'high' : confPct >= 40 ? 'medium' : 'low';

  return `
    <!-- Ticket strip -->
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;overflow-x:auto;padding:4px 0">
      ${strip}
      <div style="flex-shrink:0;font-size:12px;color:var(--gray-400);margin-left:4px">${idx + 1} of ${reviewable.length}</div>
    </div>

    <!-- Split screen -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start" id="trSplitGrid">
      <!-- LEFT: Ticket image -->
      <div class="card" style="padding:0;overflow:hidden;position:sticky;top:80px">
        <div style="padding:10px 14px;background:var(--gray-50);border-bottom:1px solid var(--gray-200);display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:700;color:var(--gray-600)"><i class="fas fa-image" style="margin-right:6px;color:var(--orange)"></i>Ticket Image</span>
          <span class="confidence-badge confidence-${confClass}" style="font-size:11px"><i class="fas fa-signal"></i> ${confPct}%</span>
        </div>
        <div style="background:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:400px;max-height:70vh;overflow:auto">
          <img src="${item.thumbnail}" style="max-width:100%;max-height:70vh;object-fit:contain;display:block" id="trTicketImg" onclick="trZoomImage(this)">
        </div>
        ${result.raw_text ? `<div style="padding:10px 14px;background:var(--gray-50);border-top:1px solid var(--gray-200);max-height:100px;overflow-y:auto">
          <div style="font-size:10px;font-weight:600;color:var(--gray-400);text-transform:uppercase;margin-bottom:4px">Extracted Text</div>
          <div style="font-size:11px;color:var(--gray-600);white-space:pre-wrap;font-family:monospace">${escapeHtml(result.raw_text)}</div>
        </div>` : ''}
      </div>

      <!-- RIGHT: Order form -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;background:var(--gray-50);border-bottom:1px solid var(--gray-200)">
          <span style="font-size:13px;font-weight:700;color:var(--gray-600)"><i class="fas fa-clipboard-list" style="margin-right:6px;color:var(--navy-light)"></i>${isError ? 'Scan Failed — Manual Entry' : 'Order Details'}</span>
        </div>
        <div style="padding:16px">
          ${isError ? `<div style="padding:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;margin-bottom:16px;font-size:13px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(item.error || 'Could not extract details')}. <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="trRetryItem(${item.id})"><i class="fas fa-redo"></i> Retry Scan</button></div>` : ''}

          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label" style="font-size:12px">Customer *</label>
            <select class="form-select" id="trCustomer" onchange="trLoadAddresses(this.value)">
              <option value="">— Select customer —</option>
              ${custOpts}
              ${newCustOpt}
            </select>
          </div>

          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label" style="font-size:12px">Delivery Address</label>
            <select class="form-select" id="trAddress"><option value="">Loading...</option></select>
          </div>

          <div class="form-row" style="gap:10px;margin-bottom:12px">
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:12px">Order #</label>
              <input class="form-input" id="trOrderNum" value="${escapeHtml(result.order_number || '')}" placeholder="Auto if empty" style="font-family:monospace;font-size:13px">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:12px">Delivery Date</label>
              <input class="form-input" type="date" id="trDate" value="${result.delivery_date || ''}">
            </div>
          </div>

          <div class="form-row" style="gap:10px;margin-bottom:12px">
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:12px">Priority</label>
              <select class="form-select" id="trPriority">
                <option value="normal" ${(result.priority||'normal')==='normal'?'selected':''}>Normal</option>
                <option value="high" ${result.priority==='high'?'selected':''}>High</option>
                <option value="urgent" ${result.priority==='urgent'?'selected':''}>Urgent</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:12px">Notes</label>
              <input class="form-input" id="trNotes" value="${escapeHtml(result.special_instructions || '')}" placeholder="Special instructions">
            </div>
          </div>

          <div style="margin-bottom:12px">
            <label class="form-label" style="font-size:12px">Items (${items.length})</label>
            ${items.length > 0 ? `<table class="sq-review-items-table" style="width:100%">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table>` : '<div style="padding:12px;background:var(--gray-50);border-radius:8px;font-size:13px;color:var(--gray-400);text-align:center">No items extracted</div>'}
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;padding-top:12px;border-top:1px solid var(--gray-200)">
            <button class="btn btn-outline btn-sm" onclick="trSkipTicket(${item.id})" style="flex:0"><i class="fas fa-forward"></i> Skip</button>
            <button class="btn btn-outline btn-sm" onclick="trDismissTicket(${item.id})" style="flex:0;color:var(--red)"><i class="fas fa-trash"></i></button>
            <div style="flex:1"></div>
            <button class="btn btn-primary" onclick="trCreateOrder(${item.id})" id="trCreateBtn"><i class="fas fa-check"></i> Create Order</button>
          </div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:8px;text-align:right">
            ${reviewable.length > 1 ? `Will auto-advance to next ticket (${reviewable.length - 1} remaining)` : 'Last ticket in queue'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function trAddFiles(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  sqInit();
  sqShow();
  for (let i = 0; i < files.length; i++) {
    sqAddFile(files[i]);
  }
  event.target.value = '';
  // If we're on the review page, refresh it after a short delay
  if (currentPage === 'ticket_review') {
    setTimeout(() => renderTicketReview(), 500);
  }
}

function trStartCamera() {
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = 'image/*';
  tempInput.capture = 'environment';
  tempInput.style.display = 'none';
  tempInput.onchange = function(e) {
    if (e.target.files[0]) {
      sqInit();
      sqShow();
      sqAddFile(e.target.files[0]);
      if (currentPage === 'ticket_review') {
        setTimeout(() => renderTicketReview(), 500);
      }
    }
    tempInput.remove();
  };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function trSelectTicket(idx) {
  window._trSelectedIdx = idx;
  renderTicketReview();
}

async function trLoadAddresses(custId, ticketAddr) {
  const sel = document.getElementById('trAddress');
  if (!sel) return;
  if (!custId || custId === '__new__') {
    sel.innerHTML = '<option value="">Will use ticket address</option>';
    return;
  }
  try {
    const { data } = await API.get('/customers/' + custId);
    const addrs = data.addresses || [];
    sel.innerHTML = addrs.length > 0
      ? addrs.map(a => `<option value="${a.id}">${a.label}: ${a.street}, ${a.city}</option>`).join('')
      : '<option value="">No addresses on file</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">Error loading addresses</option>';
  }
}

function trZoomImage(img) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
  overlay.onclick = () => overlay.remove();
  const bigImg = document.createElement('img');
  bigImg.src = img.src;
  bigImg.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px';
  overlay.appendChild(bigImg);
  document.body.appendChild(overlay);
}

function trRetryItem(id) {
  sqRetryItem(id);
  setTimeout(() => renderTicketReview(), 500);
}

function trSkipTicket(id) {
  const sq = window._scanQueue;
  const reviewable = sq.items.filter(i => i.status === 'ready' || i.status === 'error');
  const curIdx = window._trSelectedIdx || 0;
  // Move to next ticket
  if (curIdx < reviewable.length - 1) {
    window._trSelectedIdx = curIdx; // stays same since we skip
  } else {
    window._trSelectedIdx = Math.max(0, curIdx - 1);
  }
  sqDismissItem(id);
  renderTicketReview();
}

function trDismissTicket(id) {
  window._trSelectedIdx = 0;
  sqDismissItem(id);
  renderTicketReview();
}

async function trCreateOrder(id) {
  const sq = window._scanQueue;
  const item = sq.items.find(i => i.id === id);
  if (!item) return;

  const btn = document.getElementById('trCreateBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }

  const result = item.result || {};
  const custVal = document.getElementById('trCustomer')?.value;
  const addrVal = document.getElementById('trAddress')?.value;
  const items = result.items || [];

  try {
    let customerId = custVal;

    // Auto-create customer if new
    if (custVal === '__new__' || (!custVal && result.customer_name)) {
      const custPayload = {
        business_name: result.customer_name,
        contact_name: result.contact_name || null,
        phone: result.phone || null,
        email: result.email || null,
        customer_type: 'farm',
      };
      if (result.delivery_address?.street) {
        custPayload.address = {
          street: result.delivery_address.street,
          city: result.delivery_address.city || 'Wellington',
          state: result.delivery_address.state || 'FL',
          zip: result.delivery_address.zip || null,
        };
      }
      const { data: newCust } = await API.post('/customers', custPayload);
      customerId = newCust.id;
      if (window._custList) window._custList.push(newCust.customer || { id: newCust.id, business_name: result.customer_name });
    }

    if (!customerId) {
      showToast('Please select a customer', 'warning');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Create Order'; }
      return;
    }

    // Auto-create unmatched products
    const orderItems = [];
    for (let i = 0; i < items.length; i++) {
      const itm = items[i];
      const qty = parseInt(document.getElementById('trQty_' + i)?.value) || itm.quantity || 1;
      if (itm.product_id) {
        orderItems.push({ product_id: itm.product_id, quantity: qty });
      } else if (itm.product_name) {
        try {
          const { data: newProd } = await API.post('/products', {
            name: itm.product_name, sku: itm.sku || null,
            category: 'other', weight_per_unit: 50, unit_type: 'bag', price: itm.price || 0,
          });
          const prod = newProd.product || { id: newProd.id };
          if (window._prodList) window._prodList.push(prod);
          orderItems.push({ product_id: prod.id, quantity: qty });
        } catch (e) { console.error('Auto-create product failed:', e); }
      }
    }

    // Get address
    let addrId = addrVal ? parseInt(addrVal) : null;
    if (!addrId && customerId && (custVal === '__new__' || !custVal)) {
      try {
        const { data: cd } = await API.get('/customers/' + customerId);
        if (cd.addresses?.length) addrId = cd.addresses[0].id;
      } catch(e) {}
    }

    const { data } = await API.post('/orders', {
      customer_id: parseInt(customerId),
      address_id: addrId,
      order_number: document.getElementById('trOrderNum')?.value.trim() || null,
      priority: document.getElementById('trPriority')?.value,
      scheduled_date: document.getElementById('trDate')?.value || null,
      special_instructions: document.getElementById('trNotes')?.value || null,
      items: orderItems,
      created_by: currentUser?.id,
      ticket_image: item.imageData || null,
    });

    // Mark as created and remove
    item.status = 'created';
    showToast(`Order ${data.order_number} created!`, 'success');

    // Advance to next ticket
    const remaining = sq.items.filter(i => i.status === 'ready' || i.status === 'error');
    if (remaining.length > 0) {
      // Remove the created item and re-render at same index
      sq.items = sq.items.filter(i => i.id !== id);
      window._trSelectedIdx = 0;
    } else {
      sq.items = sq.items.filter(i => i.id !== id);
      window._trSelectedIdx = 0;
    }
    sqRenderList();
    sqUpdateBadge();
    renderTicketReview();

  } catch (err) {
    console.error('TR create order error:', err);
    showToast('Failed: ' + (err.response?.data?.error || err.message), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Create Order'; }
  }
}

// ==================== SCAN QUEUE (QuickBooks-style background scanning) ====================

window._scanQueue = {
  items: [],       // { id, file, thumbnail, imageData, status, result, error, createdAt }
  nextId: 1,
  dockEl: null,
  collapsed: false,
  maxConcurrent: 2,
  activeCount: 0,
};

// Persist scan queue to localStorage
function sqSave() {
  try {
    const sq = window._scanQueue;
    const serializable = sq.items.map(item => ({
      id: item.id,
      fileName: item.fileName,
      thumbnail: item.thumbSmall || item.thumbnail, // use small thumbnail
      imageData: item.imageData,
      status: item.status,
      result: item.result,
      error: item.error,
      createdAt: item.createdAt,
    }));
    const json = JSON.stringify({ items: serializable, nextId: sq.nextId });
    localStorage.setItem('bf_scan_queue', json);
  } catch (e) {
    // localStorage full — try saving without imageData (just thumbnails + results)
    console.warn('Scan queue save failed, retrying without full images:', e.message);
    try {
      const sq = window._scanQueue;
      const light = sq.items.map(item => ({
        id: item.id,
        fileName: item.fileName,
        thumbnail: item.thumbSmall || item.thumbnail,
        imageData: null, // skip heavy data
        status: item.status === 'queued' ? 'error' : item.status, // can't re-scan without image
        result: item.result,
        error: item.status === 'queued' ? 'Image too large to persist' : item.error,
        createdAt: item.createdAt,
      }));
      localStorage.setItem('bf_scan_queue', JSON.stringify({ items: light, nextId: sq.nextId }));
    } catch (e2) {
      console.warn('Scan queue save failed completely:', e2.message);
      // Last resort — clear saved queue
      localStorage.removeItem('bf_scan_queue');
    }
  }
}

// Restore scan queue from localStorage
function sqRestore() {
  try {
    const saved = localStorage.getItem('bf_scan_queue');
    if (!saved) return;
    const data = JSON.parse(saved);
    const sq = window._scanQueue;
    sq.nextId = data.nextId || 1;
    sq.items = (data.items || []).map(item => ({
      ...item,
      file: null, // File objects can't be serialized
      // If full imageData was saved, use it for thumbnail too; otherwise use saved thumbnail
      thumbnail: item.imageData || item.thumbnail,
      thumbSmall: item.thumbnail, // the persisted thumbnail is always the small one
    }));
    // Items that were 'scanning' or 'queued' when app closed need to be re-scanned
    sq.items.forEach(item => {
      if (item.status === 'scanning' || item.status === 'queued') {
        if (item.imageData) {
          item.status = 'queued'; // re-queue for scanning
        } else {
          item.status = 'error';
          item.error = 'Image lost during app restart — please re-upload';
        }
      }
    });
    // Remove items older than 24 hours or already created
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    sq.items = sq.items.filter(i => i.status !== 'created' && (i.createdAt || Date.now()) > cutoff);
  } catch (e) {
    console.warn('Failed to restore scan queue:', e.message);
    localStorage.removeItem('bf_scan_queue');
  }
}

function sqInit() {
  if (window._scanQueue.dockEl) return;
  const dock = document.createElement('div');
  dock.className = 'scan-queue-dock hidden';
  dock.id = 'scanQueueDock';
  dock.innerHTML = `
    <div class="sq-header" onclick="sqToggleCollapse()">
      <i class="fas fa-layer-group"></i>
      <span>Ticket Scan Queue</span>
      <span class="sq-header-badge" id="sqBadge">0</span>
      <i class="fas fa-chevron-down sq-header-chevron"></i>
      <button class="sq-header-close" onclick="event.stopPropagation();sqClearAll()" title="Clear all"><i class="fas fa-times"></i></button>
    </div>
    <div class="sq-body" id="sqBody">
      <div class="sq-actions">
        <label class="btn btn-primary btn-sm" style="flex:1;cursor:pointer;margin:0;position:relative;overflow:hidden;text-align:center">
          <i class="fas fa-plus"></i> Add Tickets
          <input type="file" accept="*/*" multiple style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="sqHandleFiles(event)">
        </label>
        <button class="btn btn-outline btn-sm" onclick="sqStartCameraForQueue()" style="flex:0"><i class="fas fa-camera"></i></button>
      </div>
      <div id="sqList"></div>
    </div>
  `;
  document.body.appendChild(dock);
  window._scanQueue.dockEl = dock;

  // Restore saved queue from localStorage
  sqRestore();
  const sq = window._scanQueue;
  if (sq.items.length > 0) {
    dock.classList.remove('hidden');
    sqRenderList();
    // Resume scanning for any queued items
    sqProcessNext();
  }
}

function sqShow() {
  sqInit();
  const dock = window._scanQueue.dockEl;
  dock.classList.remove('hidden');
  window._scanQueue.collapsed = false;
  dock.classList.remove('collapsed');
}

function sqToggleCollapse() {
  const sq = window._scanQueue;
  sq.collapsed = !sq.collapsed;
  sq.dockEl.classList.toggle('collapsed', sq.collapsed);
}

function sqUpdateBadge() {
  const sq = window._scanQueue;
  const scanning = sq.items.filter(i => i.status === 'scanning' || i.status === 'queued').length;
  const ready = sq.items.filter(i => i.status === 'ready').length;
  const total = scanning + ready;
  const badge = document.getElementById('sqBadge');
  if (badge) badge.textContent = total;
  // Update sidebar nav badge
  const navBadge = document.getElementById('navBadge_sqReadyCount');
  if (navBadge) {
    if (ready > 0) {
      navBadge.textContent = ready;
      navBadge.style.display = '';
    } else {
      navBadge.style.display = 'none';
    }
  }
}

function sqRenderList() {
  const sq = window._scanQueue;
  sqSave(); // Persist to localStorage
  const list = document.getElementById('sqList');
  if (!list) return;

  if (sq.items.length === 0) {
    list.innerHTML = '<div class="sq-empty"><i class="fas fa-inbox" style="font-size:20px;display:block;margin-bottom:8px"></i>Drop ticket photos here or tap Add Tickets</div>';
    sqUpdateBadge();
    return;
  }

  list.innerHTML = sq.items.map(item => {
    let statusHtml = '';
    let actionsHtml = '';
    let thumbHtml = '';

    if (item.status === 'scanning') {
      thumbHtml = `<div class="sq-progress-ring">
        <svg width="44" height="44"><circle class="sq-ring-bg" cx="22" cy="22" r="18" fill="none" stroke-width="3"/><circle class="sq-ring-fg" cx="22" cy="22" r="18" fill="none" stroke-width="3" stroke-dasharray="113" stroke-dashoffset="40" stroke-linecap="round"/></svg>
        <i class="fas fa-cog sq-spinner" style="font-size:14px;color:var(--orange)"></i>
      </div>`;
      statusHtml = '<span style="color:var(--orange)"><i class="fas fa-circle-notch sq-spinner"></i> Scanning...</span>';
    } else if (item.status === 'ready') {
      thumbHtml = `<img class="sq-thumb" src="${item.thumbnail}" alt="ticket">`;
      const custName = item.result?.customer_name || item.result?.customer_id ? 'Customer matched' : 'Unknown';
      const itemCount = item.result?.items?.length || 0;
      statusHtml = `<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Ready</span> &middot; ${custName} &middot; ${itemCount} item${itemCount !== 1 ? 's' : ''}`;
      actionsHtml = `<button class="sq-item-btn review" onclick="navigate('ticket_review')" title="Review & create order"><i class="fas fa-check"></i></button>`;
    } else if (item.status === 'error') {
      thumbHtml = `<img class="sq-thumb" src="${item.thumbnail}" alt="ticket" style="opacity:0.5">`;
      statusHtml = `<span style="color:var(--red)"><i class="fas fa-exclamation-circle"></i> Failed</span>`;
      actionsHtml = `<button class="sq-item-btn review" onclick="sqRetryItem(${item.id})" title="Retry"><i class="fas fa-redo"></i></button>`;
    } else if (item.status === 'created') {
      thumbHtml = `<img class="sq-thumb" src="${item.thumbnail}" alt="ticket" style="opacity:0.5">`;
      statusHtml = `<span style="color:var(--green)"><i class="fas fa-check"></i> Order created</span>`;
    } else { // queued
      thumbHtml = `<img class="sq-thumb" src="${item.thumbnail}" alt="ticket">`;
      statusHtml = '<span style="color:var(--gray-400)"><i class="fas fa-clock"></i> Queued</span>';
    }
    actionsHtml += `<button class="sq-item-btn dismiss" onclick="sqDismissItem(${item.id})" title="Remove"><i class="fas fa-times"></i></button>`;

    return `<div class="sq-item ${item.status === 'scanning' ? 'sq-scanning' : ''}" data-sq-id="${item.id}">
      ${thumbHtml}
      <div class="sq-info">
        <div class="sq-info-name">${item.fileName || 'Ticket ' + item.id}</div>
        <div class="sq-info-status">${statusHtml}</div>
      </div>
      <div class="sq-item-actions">${actionsHtml}</div>
    </div>`;
  }).join('');

  sqUpdateBadge();
}

function sqHandleFiles(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  sqShow();
  for (let i = 0; i < files.length; i++) {
    sqAddFile(files[i]);
  }
  // Reset the input so the same files can be re-selected
  event.target.value = '';
}

function sqAddFile(file) {
  const sq = window._scanQueue;
  const item = {
    id: sq.nextId++,
    file: file,
    fileName: file.name || 'Photo',
    thumbnail: null,
    thumbSmall: null,  // tiny thumbnail for localStorage persistence
    imageData: null,
    status: 'queued', // queued → scanning → ready|error|created
    result: null,
    error: null,
    createdAt: Date.now(),
  };
  sq.items.unshift(item);

  // Generate full compressed image for OCR + tiny thumbnail for persistence
  Promise.all([
    compressImage(file, 1200, 0.6),  // full size for scanning
    compressImage(file, 80, 0.4),    // tiny thumbnail for localStorage
  ]).then(([compressed, thumb]) => {
    item.imageData = compressed;
    item.thumbnail = compressed;
    item.thumbSmall = thumb;
    sqRenderList();
    sqProcessNext();
  });

  sqRenderList();
}

function sqStartCameraForQueue() {
  var tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = 'image/*';
  tempInput.capture = 'environment';
  tempInput.style.display = 'none';
  tempInput.onchange = function(e) {
    if (e.target.files[0]) sqAddFile(e.target.files[0]);
    tempInput.remove();
  };
  document.body.appendChild(tempInput);
  tempInput.click();
}

function sqProcessNext() {
  const sq = window._scanQueue;
  if (sq.activeCount >= sq.maxConcurrent) return;

  const next = sq.items.find(i => i.status === 'queued' && i.imageData);
  if (!next) return;

  sq.activeCount++;
  next.status = 'scanning';
  sqRenderList();

  // Build payload (same as scanTicketImage but non-blocking)
  const payload = { image: next.imageData };
  const hasUserKey = localStorage.getItem('bf_openai_key');
  if (hasUserKey) {
    payload.api_key = hasUserKey;
    payload.base_url = localStorage.getItem('bf_openai_url') || undefined;
  }
  const userModel = localStorage.getItem('bf_openai_model');
  if (userModel) payload.model = userModel;

  API.post('/ocr/scan-ticket', payload)
    .then(resp => {
      sq.activeCount--;
      if (resp.data.success && resp.data.data) {
        next.status = 'ready';
        next.result = resp.data.data;
        // Play a subtle notification sound
        sqNotify(next);
      } else {
        next.status = 'error';
        next.error = 'Could not extract order details';
      }
      sqRenderList();
      sqProcessNext();
    })
    .catch(err => {
      sq.activeCount--;
      next.status = 'error';
      next.error = err.response?.data?.error || err.message || 'Scan failed';
      sqRenderList();
      sqProcessNext();
    });

  // Start another if we have capacity
  sqProcessNext();
}

function sqNotify(item) {
  const custName = item.result?.customer_name || 'Unknown customer';
  const itemCount = item.result?.items?.length || 0;
  showToast(`Ticket scanned: ${custName}, ${itemCount} item${itemCount !== 1 ? 's' : ''} — open Ticket Review`, 'success');

  // Update sidebar badge
  sqUpdateBadge();

  // If on the ticket review page, auto-refresh
  if (currentPage === 'ticket_review') {
    renderTicketReview();
  }

  // Expand dock if collapsed
  if (window._scanQueue.collapsed) {
    window._scanQueue.collapsed = false;
    window._scanQueue.dockEl.classList.remove('collapsed');
  }
}

function sqRetryItem(id) {
  const item = window._scanQueue.items.find(i => i.id === id);
  if (!item) return;
  item.status = 'queued';
  item.error = null;
  item.result = null;
  sqRenderList();
  sqProcessNext();
}

function sqDismissItem(id) {
  const sq = window._scanQueue;
  sq.items = sq.items.filter(i => i.id !== id);
  sqRenderList();
  if (sq.items.length === 0) {
    sq.dockEl.classList.add('hidden');
  }
}

function sqClearAll() {
  const sq = window._scanQueue;
  sq.items = [];
  sq.activeCount = 0;
  sqRenderList();
  sq.dockEl.classList.add('hidden');
}

// ==================== SCAN QUEUE REVIEW MODAL ====================
async function sqReviewItem(id) {
  const sq = window._scanQueue;
  const item = sq.items.find(i => i.id === id);
  if (!item || !item.result) return;

  const result = item.result;

  // Fetch customers and products for dropdowns
  let customers = window._custList || [];
  let products = window._prodList || [];
  if (!customers.length) {
    try { const r = await API.get('/customers'); customers = r.data.customers || []; window._custList = customers; } catch(e) {}
  }
  if (!products.length) {
    try { const r = await API.get('/products'); products = r.data.products || []; window._prodList = products; } catch(e) {}
  }

  // Determine matched customer
  const matchedCustId = result.customer_id || '';
  const custOptions = customers.map(c =>
    `<option value="${c.id}" ${c.id == matchedCustId ? 'selected' : ''}>${c.business_name}</option>`
  ).join('');

  // Build items table
  const items = result.items || [];
  const itemRows = items.map((itm, i) => {
    const matchedProd = itm.product_id ? products.find(p => p.id === itm.product_id) : null;
    const prodName = matchedProd ? matchedProd.name : (itm.product_name || 'Unknown');
    const prodSku = matchedProd ? matchedProd.sku : (itm.sku || '');
    return `<tr>
      <td><strong>${escapeHtml(prodName)}</strong>${prodSku ? '<br><code style="font-size:11px">' + escapeHtml(prodSku) + '</code>' : ''}</td>
      <td><input type="number" class="form-input" value="${itm.quantity || 1}" min="1" style="width:70px" id="sqRevQty_${i}"></td>
      <td>${matchedProd?.unit_type || itm.unit || 'bag'}</td>
    </tr>`;
  }).join('');

  const confPct = Math.round((result.confidence || 0) * 100);
  const confClass = confPct >= 70 ? 'high' : confPct >= 40 ? 'medium' : 'low';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay sq-review-modal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:640px">
    <div class="modal-header">
      <h3 class="modal-title"><i class="fas fa-clipboard-check" style="color:var(--orange);margin-right:8px"></i>Review Scanned Ticket</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body" style="max-height:65vh;overflow-y:auto">

      <div style="display:flex;gap:16px;margin-bottom:16px">
        <img src="${item.thumbnail}" style="width:100px;height:100px;object-fit:cover;border-radius:10px;border:1px solid var(--gray-200);flex-shrink:0">
        <div style="flex:1">
          <span class="confidence-badge confidence-${confClass}"><i class="fas fa-signal"></i> ${confPct}% Confidence</span>
          ${result.raw_text ? `<div style="margin-top:8px;font-size:11px;color:var(--gray-500);max-height:60px;overflow-y:auto;font-family:monospace;white-space:pre-wrap">${escapeHtml(result.raw_text.substring(0, 300))}</div>` : ''}
        </div>
      </div>

      <div style="background:var(--gray-50);border-radius:10px;padding:14px;margin-bottom:16px">
        <div class="sq-review-field">
          <label>Customer</label>
          <select class="form-select" id="sqRevCustomer" style="flex:1" onchange="sqRevLoadAddresses(this.value)">
            <option value="">— Select —</option>
            ${custOptions}
            ${!matchedCustId && result.customer_name ? `<option value="__new__" selected>+ New: ${escapeHtml(result.customer_name)}</option>` : ''}
          </select>
        </div>
        <div class="sq-review-field">
          <label>Address</label>
          <select class="form-select" id="sqRevAddress" style="flex:1"><option value="">Loading...</option></select>
        </div>
        <div class="sq-review-field">
          <label>Order #</label>
          <input class="form-input" id="sqRevOrderNum" value="${result.order_number || ''}" placeholder="Auto if empty" style="flex:1">
        </div>
        <div class="sq-review-field">
          <label>Delivery Date</label>
          <input class="form-input" type="date" id="sqRevDate" value="${result.delivery_date || ''}" style="flex:1">
        </div>
        <div class="sq-review-field">
          <label>Priority</label>
          <select class="form-select" id="sqRevPriority" style="flex:1">
            <option value="normal" ${(result.priority||'normal')==='normal'?'selected':''}>Normal</option>
            <option value="high" ${result.priority==='high'?'selected':''}>High</option>
            <option value="urgent" ${result.priority==='urgent'?'selected':''}>Urgent</option>
          </select>
        </div>
        <div class="sq-review-field">
          <label>Notes</label>
          <input class="form-input" id="sqRevNotes" value="${escapeHtml(result.special_instructions || '')}" placeholder="Special instructions" style="flex:1">
        </div>
      </div>

      <h4 style="font-size:13px;font-weight:700;margin-bottom:6px"><i class="fas fa-box" style="color:var(--navy-light);margin-right:4px"></i>Items (${items.length})</h4>
      ${items.length > 0 ? `<table class="sq-review-items-table">
        <thead><tr><th>Product</th><th>Qty</th><th>Unit</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>` : '<div style="color:var(--gray-400);font-size:13px;padding:10px">No items extracted — you can add them after creating the order</div>'}

    </div>
    <div class="modal-footer" style="display:flex;gap:8px">
      <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-outline" onclick="sqSkipItem(${item.id});this.closest('.modal-overlay').remove()"><i class="fas fa-forward"></i> Skip</button>
      <button class="btn btn-primary" onclick="sqConfirmItem(${item.id})" id="sqConfirmBtn"><i class="fas fa-check"></i> Create Order</button>
    </div>
  </div>`;

  document.body.appendChild(modal);

  // Load addresses for matched customer
  if (matchedCustId) {
    sqRevLoadAddresses(matchedCustId, result.delivery_address);
  } else {
    document.getElementById('sqRevAddress').innerHTML = '<option value="">— Select customer first —</option>';
  }
}

async function sqRevLoadAddresses(custId, ticketAddr) {
  const sel = document.getElementById('sqRevAddress');
  if (!custId || custId === '__new__') {
    sel.innerHTML = '<option value="">Will use ticket address for new customer</option>';
    return;
  }
  try {
    const { data } = await API.get('/customers/' + custId);
    const addrs = data.addresses || [];
    sel.innerHTML = addrs.map(a => `<option value="${a.id}">${a.label}: ${a.street}, ${a.city}</option>`).join('');
    if (addrs.length === 0) sel.innerHTML = '<option value="">No addresses on file</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">Error loading addresses</option>';
  }
}

function sqSkipItem(id) {
  // Just dismiss without creating
  sqDismissItem(id);
}

async function sqConfirmItem(id) {
  const sq = window._scanQueue;
  const item = sq.items.find(i => i.id === id);
  if (!item || !item.result) return;

  const btn = document.getElementById('sqConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }

  const result = item.result;
  const custVal = document.getElementById('sqRevCustomer').value;
  const addrVal = document.getElementById('sqRevAddress').value;
  const items = result.items || [];

  try {
    let customerId = custVal;

    // Create new customer if needed
    if (custVal === '__new__' || (!custVal && result.customer_name)) {
      const custPayload = {
        business_name: result.customer_name,
        contact_name: result.contact_name || null,
        phone: result.phone || null,
        email: result.email || null,
        customer_type: 'farm',
      };
      if (result.delivery_address?.street) {
        custPayload.address = {
          street: result.delivery_address.street,
          city: result.delivery_address.city || 'Wellington',
          state: result.delivery_address.state || 'FL',
          zip: result.delivery_address.zip || null,
        };
      }
      const { data: newCust } = await API.post('/customers', custPayload);
      customerId = newCust.id;
      if (window._custList) window._custList.push(newCust.customer || { id: newCust.id, business_name: result.customer_name });
    }

    if (!customerId) {
      showToast('Please select a customer', 'warning');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Create Order'; }
      return;
    }

    // Auto-create unmatched products
    const orderItems = [];
    for (let i = 0; i < items.length; i++) {
      const itm = items[i];
      const qty = parseInt(document.getElementById('sqRevQty_' + i)?.value) || itm.quantity || 1;

      if (itm.product_id) {
        orderItems.push({ product_id: itm.product_id, quantity: qty });
      } else if (itm.product_name) {
        try {
          const { data: newProd } = await API.post('/products', {
            name: itm.product_name, sku: itm.sku || null,
            category: 'other', weight_per_unit: 50, unit_type: 'bag', price: itm.price || 0,
          });
          const prod = newProd.product || { id: newProd.id };
          if (window._prodList) window._prodList.push(prod);
          orderItems.push({ product_id: prod.id, quantity: qty });
        } catch (e) { console.error('Auto-create product failed:', e); }
      }
    }

    // Load address for new customer if needed
    let addrId = addrVal ? parseInt(addrVal) : null;
    if (!addrId && customerId && custVal === '__new__') {
      try {
        const { data: custData } = await API.get('/customers/' + customerId);
        if (custData.addresses?.length) addrId = custData.addresses[0].id;
      } catch(e) {}
    }

    const { data } = await API.post('/orders', {
      customer_id: parseInt(customerId),
      address_id: addrId,
      order_number: document.getElementById('sqRevOrderNum').value.trim() || null,
      priority: document.getElementById('sqRevPriority').value,
      scheduled_date: document.getElementById('sqRevDate').value || null,
      special_instructions: document.getElementById('sqRevNotes').value || null,
      items: orderItems,
      created_by: currentUser?.id,
      ticket_image: item.imageData || null,
    });

    // Mark item as created
    item.status = 'created';
    item.orderNumber = data.order_number;
    sqRenderList();

    // Close review modal
    const modalEl = document.querySelector('.sq-review-modal');
    if (modalEl) modalEl.remove();

    showToast(`Order ${data.order_number} created from scan queue!`, 'success');

    // Auto-dismiss created items after a delay
    setTimeout(() => sqDismissItem(id), 3000);

    // If all items processed, show summary
    const remaining = sq.items.filter(i => i.status === 'ready');
    if (remaining.length > 0) {
      // Auto-open next review
      setTimeout(() => sqReviewItem(remaining[0].id), 500);
    }

  } catch (err) {
    console.error('SQ create order error:', err);
    showToast('Failed to create order: ' + (err.response?.data?.error || err.message), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Create Order'; }
  }
}

// Open scan queue from anywhere in the app
function openScanQueue() {
  sqShow();
}

// Batch upload — navigate to review page and trigger file picker
function sqBatchUpload() {
  sqInit();
  sqShow();
  navigate('ticket_review');
  // Small delay so the page renders before triggering file picker
  setTimeout(() => {
    const input = document.querySelector('#trContent input[type="file"]');
    if (input) input.click();
  }, 200);
}

// Expose cleanup for when parent shell unloads this module
window._logisticsCleanup = function() {
  // Clear any intervals/timers
  if (typeof fleetTrackingInterval !== 'undefined' && fleetTrackingInterval) {
    clearInterval(fleetTrackingInterval);
  }
  // Remove scan queue dock
  if (window._scanQueue.dockEl) {
    window._scanQueue.dockEl.remove();
    window._scanQueue.dockEl = null;
  }
  window._scanQueue.items = [];
  window._scanQueue.activeCount = 0;
  if (window._trRefreshTimer) clearTimeout(window._trRefreshTimer);
  window._trSelectedIdx = 0;
  // Reset state
  currentUser = null;
  currentPage = 'dashboard';
  sidebarOpen = false;
};

// end logistics module
