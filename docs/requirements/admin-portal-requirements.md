# Hericilla Support Services Limited — Company Admin Portal
## Functionalities and Requirements

Supply Chain • Logistics • Procurement • Transportation • Workforce Management

### 1. Company Overview

Hericilla Support Services Limited is a supply chain services provider specialising in total logistics and procurement, with experience in the oil and gas industry. Its service portfolio includes trucking, transportation, procurement, packing and removal, materials and logistics support, and on-demand services.

The proposed company admin portal will centralise operations, client and supplier records, service requests, job execution, workforce attendance, financial records, documents, and management reporting.

### 2. Dashboard Overview

The dashboard should provide a real-time operational summary, including:

- Total revenue and expenses.
- Active and completed projects or jobs.
- Pending service requests and quotations.
- Ongoing deliveries and transportation jobs.
- Procurement orders awaiting approval.
- Outstanding client payments and overdue invoices.
- Staff attendance status and shift coverage.
- Recent activities, deadlines, alerts, and exceptions.

### 3. Client Management

- Register and manage corporate clients and contact persons.
- Store company details, addresses, and communication records.
- View each client's service history and current jobs.
- Manage client contracts, agreements, and service-level terms.
- Maintain client-specific pricing and billing details.
- Store client payment records and related documents.

### 4. Logistics and Transportation

- Create and manage transportation and trucking jobs.
- Assign drivers, trucks, vehicles, and delivery teams.
- Record pickup locations, destinations, delivery instructions, and schedules.
- Track shipment and delivery status through defined job stages.
- Upload delivery notes, waybills, and proof-of-delivery records.
- Record fuel, tolls, maintenance, and other transportation expenses.
- Track vehicle availability, inspections, and maintenance schedules.

### 5. Procurement Management

- Receive and process client procurement requests.
- Create purchase requisitions and purchase orders.
- Request, collect, and compare supplier quotations.
- Route purchase requests for approval based on authorised limits.
- Track order status, expected delivery dates, and supplier lead times.
- Record materials, quantities, unit costs, taxes, and other charges.
- Store invoices, receipts, purchase records, and procurement documentation.
- Calculate procurement costs, client charges, savings, and job-level margins.

### 6. Packing and Removal

- Create packing, relocation, and removal jobs.
- Record items, quantities, descriptions, and condition where needed.
- Schedule packing and removal teams.
- Assign vehicles, equipment, and job supervisors.
- Record pickup and destination addresses.
- Track packing, loading, transit, unloading, and completion status.
- Generate item inventories, handover records, and delivery reports.

### 7. Supplier and Vendor Management

- Register suppliers and vendors with company and contact information.
- Organise suppliers by product, service, and procurement category.
- Compare supplier pricing, quotations, payment terms, and lead times.
- Track supplier delivery performance, quality, and reliability.
- Maintain approved supplier lists and supplier status.
- Store supplier contracts, certificates, invoices, and payment terms.

### 8. Service Request Management

- Receive service requests from hericilla_clients or internal teams.
- Categorise requests by service type: logistics, trucking, transportation, procurement, packing and removal, or materials support.
- Assign requests to responsible departments, officers, or supervisors.
- Set priority levels, deadlines, and service-level targets.
- Track each request from submission and quotation through approval, execution, and closure.
- Record client feedback, complaints, and service issues.
- Generate quotations, proposals, and job instructions.

### 9. Materials and Inventory Management

- Track materials, equipment, and supplies held by the company.
- Record stock received, issued, returned, transferred, or written off.
- Set minimum stock levels and reorder alerts.
- Assign materials to projects, clients, or job numbers.
- Record damaged, missing, or returned items.
- Generate stock movement and inventory valuation reports.

### 10. Contracts and Document Management

- Store client and supplier contracts and agreements.
- Manage quotations, invoices, purchase orders, and receipts.
- Upload permits, insurance documents, licences, and relevant certificates.
- Track document expiry dates and send reminders.
- Store waybills, delivery notes, proof of delivery, and job completion reports.
- Generate downloadable PDF documents and reports.
- Restrict sensitive documents based on user permissions.

### 11. Finance and Billing

- Generate client invoices from approved quotations or completed jobs.
- Track paid, unpaid, partially paid, and overdue invoices.
- Record supplier payments, operating expenses, and job costs.
- Manage client billing rates and approved pricing schedules.
- Calculate job-level revenue, costs, and profit margins.
- Generate financial summaries and export transaction records for accounting.
- Maintain a traceable record of invoice adjustments and payment updates.

### 12. Staff and Fleet Personnel Management

- Register employees, drivers, contractors, and temporary workers.
- Maintain staff profiles, departments, roles, and contact details.
- Assign staff to projects, jobs, sites, and shifts.
- Manage work schedules, attendance eligibility, and job assignments.
- Record relevant staff licences, training, and certification expiry dates.
- Track staff assignment history and job completion.

### 13. Staff Attendance and Shift Management

- **Daily sign-in and sign-out:** allow staff to clock in when starting work and clock out when finishing.
- **Shift scheduling:** create shifts with dates, start and end times, breaks, and assigned employees.
- **Job-based attendance:** link attendance records to a specific project, client site, work order, or job assignment.
- **Location verification:** capture GPS coordinates at sign-in and sign-out where permitted, and compare them with the assigned site or approved geofence.
- **Late arrival and early departure:** flag attendance outside configured shift rules.
- **Overtime tracking:** calculate time worked beyond the scheduled shift, subject to configured rules and approval.
- **Attendance dashboard:** display present, absent, late, on-break, clocked-out, and off-duty staff.
- **Attendance history:** filter records by employee, department, date range, shift, job, or worksite.
- **Manual correction:** allow authorised supervisors to correct missed or inaccurate clock events, requiring a reason and retaining an audit trail.
- **Reports:** generate daily, weekly, and monthly attendance and hours-worked reports for management and payroll support.
- **Notifications:** alert authorised managers to absences, missed clock-outs, late arrivals, and unusual attendance records.
- **Approval workflow:** allow supervisors to review and approve attendance exceptions where required.
- **Multiple jobs or shifts:** allow a staff member to record attendance against different jobs during the day, while preventing overlapping active sessions.
- **Office and remote-site support:** support office-based attendance and attendance at remote client or operational sites.
- **Offline handling:** if connectivity is unreliable at a worksite, securely store clock events temporarily and synchronise them later, preserving the original event time and sync time.

### 14. Reports and Analytics

- Procurement expenditure, supplier price comparisons, and savings.
- Transportation costs, delivery completion, delays, and fleet utilisation.
- Revenue and profitability by service, client, project, or job.
- Client activity, outstanding balances, and invoice ageing.
- Materials usage, stock movement, and inventory levels.
- Staff attendance, hours worked, overtime, and shift coverage.
- Supplier performance and service-level compliance.
- Monthly, quarterly, and annual reports with export options.

### 15. Administration, Security, and Audit

- Role-based access control for administrators, procurement officers, finance staff, logistics officers, supervisors, and other authorised roles.
- Separate permissions for viewing, creating, editing, approving, exporting, and deleting records.
- Approval workflows for purchases, expenses, attendance corrections, and other controlled actions.
- Audit logs for important activities, including changes to financial and attendance records.
- Notifications, reminders, and configurable system settings.
- Secure authentication, session management, and password reset.
- Data backup, retention, and recovery procedures appropriate to business needs.

### 16. Recommended Sidebar Navigation

Dashboard · Clients · Service Requests · Logistics & Transportation · Procurement · Packing & Removal · Suppliers & Vendors · Inventory & Materials · Contracts & Documents · Finance & Billing · Staff Management · Staff Attendance & Shifts · Reports & Analytics · Settings & Permissions

*(Implemented as a grouped 7-item elderly-friendly primary nav — see docs/ARCHITECTURE.md.)*

### 17. Core Operational Workflows

- **A. Client Service:** Client request → Quotation → Client approval → Service/job assignment → Service execution → Completion evidence → Invoice → Payment and closure.
- **B. Procurement:** Procurement request → Supplier quotation comparison → Purchase approval → Purchase order → Order fulfilment and delivery → Receipt and verification → Invoice/payment reconciliation.
- **C. Transportation:** Transport booking → Vehicle and driver assignment → Dispatch → Shipment tracking → Proof of delivery → Job costing and closure.
- **D. Staff Attendance:** Admin/supervisor creates shift/job assignment → Staff signs in with timestamp and (where enabled) location → Staff performs assigned work → Staff signs out → System calculates hours and flags exceptions → Supervisor reviews and approves exceptions → Reports available for management and payroll support.

### 18. Recommended Implementation Priorities

**Phase 1 — Core Operations:** Dashboard and user permissions; client records and service requests; procurement and supplier management; logistics and transportation job management; staff profiles, shift scheduling, and sign-in/sign-out attendance; basic invoices, documents, and operational reports.

**Phase 2 — Controls and Reporting:** Purchase and expense approval workflows; GPS/site verification and attendance exception management; inventory tracking and vehicle maintenance; supplier performance reporting and job-level costing; automated reminders and PDF exports.

**Phase 3 — Advanced Capabilities:** Advanced analytics and operational dashboards; offline attendance capture and controlled synchronisation for remote sites; more detailed fleet tracking integrations where required; advanced forecasting and supplier lead-time analysis.

### 19. Key Design Recommendations

- Use a unique job or work-order reference to connect service requests, procurement, transport, staff attendance, documents, and invoices.
- Make permissions and approvals configurable so that staff cannot approve their own restricted transactions unless explicitly authorised by company policy.
- Keep an audit history for attendance edits, purchase approvals, financial changes, and document status changes.
- For GPS attendance, explain location use to employees, collect only what is necessary, and define access and retention rules.
- Treat attendance hours as operational records; apply the company's approved rules before using them for payroll calculations.
- Design for mobile use by field staff and supervisors, even if the primary admin portal is web-based.

### User-added requirements (owner instructions, beyond the PDF spec)

- **Salary allocator & tracking** — payroll structures, payroll runs generated from approved attendance, payment tracking and payslips.
- **Vehicles movement & allocation** — fleet register, allocation calendar, gate-in/gate-out movement ledger with odometer.
- **Inventory system** — as spec §9, front-and-centre in the admin portal.
- **Staff details and check-in/check-out (attendance)** — as spec §12–13.
- **UI must be as simple as possible** for elderly, non-technical users while remaining detailed.
