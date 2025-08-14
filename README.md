# Healthcare-Access-Smart-Appointment-System
Innovative smart appointment booking system aimed at streamlining the booking process, ensuring that students at the NWU Health centre can access healthcare services more efficiently and effectively.

# Azure SQL Connection Info (Optional)
- Server: your-server-name.database.windows.net
- Database: clinic_appointments_db
- Authentication: SQL Login
- Username: sqladminclinic
- Password: [please request]


## Note on Default Azure Tables

The `SalesLT.*` tables are part of Azure SQL's default sample data (AdventureWorks). They were not created by me and are not part of this project. Please focus on tables under the `dbo.` schema (e.g., `dbo.Appointment`, `dbo.Staff`, etc.).

Admin DashBoard REST API
This part provides an overview of the REST API endpoints for the Admin Dashboard of the NWU Health Access Smart Appointment System. The API is built using Node.js with the Express framework and interacts with a Microsoft Azure SQL Database.

API Endpoints
The following endpoints are available for administrative tasks:

1. System Settings & Announcements
POST /admin/announcements: Creates and posts a new clinic-wide announcement.

Request Body: { "title": "string", "content": "string", "admin_id": "integer" }

Reference: This functionality is used to manage announcements as seen on the Admin Dashboard.

PUT /admin/system-settings: Updates system configuration settings such as the daily appointment limit or booking rules.

Request Body: { "config_key": "string", "config_value": "string" }

Reference: This corresponds to the System Settings section on the Admin Dashboard.

2. User & Appointment Management
GET /admin/users: Retrieves a list of all users, including their status (e.g., Active, Inactive) and roles (e.g., Student, Staff, Admin).

PUT /admin/users/:id: Updates a user's status (e.g., activate/deactivate).

GET /admin/appointments: Retrieves a list of all appointments for viewing and management.

PUT /admin/appointments/:id: Updates an existing appointment's status or notes.

3. Feedback & FAQs
GET /admin/feedback: Retrieves all feedback submitted by students for moderation. Each feedback item has a moderation status, such as "Pending" or "Moderated".

PUT /admin/feedback/:id/approve: Approves a specific feedback item, changing its status to "Moderated".

DELETE /admin/feedback/:id: Deletes a specific feedback item.

GET /admin/faqs: Retrieves all frequently asked questions.

POST /admin/faqs: Creates a new FAQ entry with a question and answer.

PUT /admin/faqs/:id: Edits an existing FAQ entry.

DELETE /admin/faqs/:id: Deletes a specific FAQ entry.

4. Reports & Analytics
GET /admin/reports: Generates and retrieves system reports, such as the total number of users and bookings.

GET /admin/analytics: Provides key analytical data, like the most popular service.

GET /admin/logs: Retrieves the audit log for security and compliance purposes.
