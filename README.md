# Healthcare-Access-Smart-Appointment-System
Innovative smart appointment booking system aimed at streamlining the booking process, ensuring that students at the NWU Health centre can access healthcare services more efficiently and effectively.


## Azure SQL Connection Info 
- Server:  sqldatabaseclinicsystem.database.windows.net
- Database: clinic_appointments_db
- Authentication: SQL Login
- Username: sqladminclinic
- Password: [please request ]

-connection Strings : Server=tcp:sqldatabaseclinicsystem.database.windows.net,1433;Initial Catalog=clinic_appointments_db;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;Authentication="Active Directory Default";

## Note on Default Azure Tables

The `SalesLT.*` tables are part of Azure SQL's default sample data (AdventureWorks). They were not created by our team and are not part of this project. Please focus on tables under the `dbo.` schema (e.g., `dbo.Appointment`, `dbo.Staff`, etc.).
