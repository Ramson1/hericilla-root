# Hericilla Support Services Limited — Digital Platform Requirements
## Company Website • Drivers' Mobile App • Staff Portal

Supply Chain • Logistics • Procurement • Transportation • Workforce Management

### 1. Purpose and Scope

This document defines the recommended functionalities for three connected digital platforms for Hericilla Support Services Limited: a public company website, a mobile application for drivers, and a web-based staff portal. These platforms should integrate with the company admin portal through a shared backend and database, subject to role-based permissions.

### 2. Company Website

#### 2.1 Public-Facing Website

- Home page and company overview.
- About Us, mission, vision, values, and company background.
- Services pages for logistics, trucking, transportation, procurement, packing and removal, and materials support.
- Oil and gas industry experience and service capabilities.
- Why Choose Us section.
- Projects, relevant experience, and approved client references.
- Health, Safety, Environment and Quality (HSEQ) information, where applicable.
- Careers and job vacancies.
- Contact details, office locations, and enquiry channels.

#### 2.2 Client Services and Enquiries

- Request a quotation for company services.
- Submit logistics, trucking, transportation, procurement, or packing and removal enquiries.
- Upload supporting documents where required.
- Receive an enquiry reference number after successful submission.
- Contact the company through forms, email, and telephone links.
- Provide authenticated enquiry tracking if a client portal is introduced.

#### 2.3 Website Content Management

- Update website pages and service descriptions.
- Publish news, announcements, and project updates.
- Manage job vacancies and career submissions.
- Review and assign incoming enquiries to the appropriate team.
- Manage approved testimonials, logos, and project images.
- View website enquiry statistics and submission history.

### 3. Drivers' Mobile App

#### 3.1 Driver Account and Dashboard

- Secure driver login and profile management.
- View assigned jobs, upcoming trips, and daily schedules.
- View assigned vehicle details and registration information.
- Check job status and completed-trip history.
- Receive notifications for new assignments, schedule changes, and operational updates.

#### 3.2 Trip and Job Management

- Acknowledge or accept assigned jobs.
- View pickup and delivery addresses, client contacts, and instructions.
- Open directions in a supported navigation application.
- Record arrival at pickup and delivery locations.
- Update job statuses such as assigned, accepted, arrived, loaded, in transit, and delivered.
- Report delays, breakdowns, route issues, and other operational problems.
- Request assistance from the operations team.

#### 3.3 Proof of Delivery

- Capture delivery photos.
- Record the recipient's name and signature where appropriate.
- Record delivery date and time.
- Upload waybills and relevant delivery documents.
- Report delivered, rejected, damaged, missing, or partially delivered items.
- Submit delivery confirmation for office or supervisor verification.

#### 3.4 Vehicle and Trip Records

- Complete pre-trip and post-trip vehicle inspection checklists.
- Report vehicle faults and maintenance requirements.
- Record odometer readings.
- Submit fuel purchases and trip expenses with receipts.
- Report accidents, safety incidents, and near misses.
- View vehicle maintenance notices and inspection reminders.

#### 3.5 Driver Attendance

- Sign in and sign out for assigned shifts.
- Clock in and out of specific jobs where required.
- Capture timestamps and GPS location where enabled and permitted.
- Record breaks and overtime under company rules.
- Flag missed clock-ins or clock-outs for supervisor review.
- View personal attendance history and submitted corrections.

### 4. Staff Portal

#### 4.1 Employee Dashboard

- View personal profile and employment information.
- View assigned tasks, projects, and deadlines.
- View upcoming shifts and schedules.
- Check attendance status and recorded hours.
- Receive company announcements and notifications.
- Review pending tasks, approvals, and operational alerts.

#### 4.2 Attendance and Shift Management

- Daily sign-in and sign-out.
- Shift-based attendance with assigned start and end times.
- Job- or project-based clock-in and clock-out.
- Record breaks and overtime where applicable.
- View personal timesheets and attendance history.
- Submit requests to correct missed or inaccurate attendance records.
- Submit leave and absence requests for approval.

#### 4.3 Task and Project Management

- View tasks assigned by supervisors.
- Update task status and progress.
- Upload reports and supporting documents.
- Record completed activities and outcomes.
- Communicate work-related issues to supervisors.
- Escalate blockers, delays, and resource needs.

#### 4.4 Department-Specific Workspace

- **Procurement:** purchase requests, supplier quotations, approvals, and order updates.
- **Logistics:** job schedules, dispatch records, and delivery status.
- **Warehouse:** stock receipts, material issues, returns, and stock counts.
- **Finance:** invoices, payment records, and authorised expense processing.
- **Supervisors:** task allocation, attendance review, and job approvals.

#### 4.5 Employee Self-Service

- Request leave and time off.
- View approved schedules and assigned shifts.
- Download company documents permitted for the employee's role.
- Update selected personal details subject to validation.
- Submit workplace support requests and incident reports.
- View relevant company policies and announcements.

### 5. Integration with the Company Admin Portal

The company admin portal remains the central control point for users, permissions, job assignments, approvals, and reporting. The website, drivers' app, and staff portal should use shared records where appropriate rather than creating disconnected copies of company data.

- Website enquiries should appear in the admin portal for review, assignment, and follow-up.
- Jobs created or approved by authorised administrators should appear in the assigned driver's app and relevant staff workspace.
- Driver job updates and proof-of-delivery records should be visible to authorised operations staff.
- Staff and driver attendance should feed into central attendance reports.
- Vehicle faults, trip expenses, and safety reports should be available to authorised fleet and operations personnel.
- Permissions should restrict users to the records and actions required for their roles.

### 6. Recommended Development Order

- **Phase 1 — Website and Core Access:** company website and service information; enquiry and quotation request forms; authentication, staff profiles, and role permissions.
- **Phase 2 — Staff Operations:** staff portal and employee dashboard; attendance, shift scheduling, and task assignments; supervisor attendance review and correction workflows.
- **Phase 3 — Driver Operations:** driver mobile app and assigned-job list; trip status updates and delivery confirmation; vehicle inspections, expense submissions, and driver attendance.
- **Phase 4 — Integration and Automation:** connect all platforms to the shared backend and database; operational notifications and automated reminders; reporting, document exports, and further tracking integrations as required.

### 7. Privacy, Security, and Operational Controls

- Use role-based access control for drivers, staff, supervisors, and administrators.
- Keep audit logs for important changes, approvals, and attendance corrections.
- Disclose GPS use to drivers and staff, limit collection to legitimate operational needs, and establish appropriate access and retention rules.
- Use secure authentication and protect uploaded documents and delivery evidence.
- If offline operation is needed at remote sites, queue events securely and synchronise them later while preserving event time and synchronisation time.
- Use the company's approved attendance and overtime rules before using recorded hours for payroll.
- Back up critical operational records and establish recovery procedures.

### 8. Recommended Platform Structure

- **Company website:** public-facing website and enquiry capture.
- **Drivers' mobile app:** assignments, trip execution, proof of delivery, vehicle reports, and driver attendance.
- **Staff portal:** employee self-service, attendance, tasks, and department-specific workflows.
- **Company admin portal:** central administration, configuration, approvals, monitoring, and reporting.
- **Shared backend and database:** common authentication and authorised access to clients, jobs, staff, attendance, vehicles, documents, and notifications.

### 9. Key Recommendation

Use a shared backend and database across all four systems. Begin with the essential workflows — website enquiries, staff attendance, shift scheduling, driver assignments, trip updates, and proof of delivery — then add advanced tracking and automation as the company's operational requirements become clearer.

### User-added requirements (owner instructions, beyond the PDF spec)

- **Contact / live chat feature** with emailing (custom chat widget → admin inbox; email notifications).
- **Push notifications** on all platforms (driver app Expo push; browser Web Push for staff + admin; email fallback).
- **Advertise the services of the company** prominently on the website.
- **Testimonials** managed via admin CMS.
- **Blog & news** published via admin CMS.
