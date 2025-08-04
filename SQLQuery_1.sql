CREATE DATABASE NWUHealthCentre;
-- ------------------------------------------------------------------------------------
-- Table for User Roles
-- This table defines the different roles within the system, such as 'Student',
-- 'Clinic Staff', and 'Administrator'. This approach allows for a flexible
-- role-based access control system.
-- ------------------------------------------------------------------------------------
CREATE TABLE UserRoles (
    RoleID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each role.
    RoleName NVARCHAR(50) NOT NULL UNIQUE -- The name of the role (e.g., 'Student').
);

-- Insert initial roles into the table.
INSERT INTO UserRoles (RoleName) VALUES ('Student'), ('Clinic Staff'), ('Administrator');

-- ------------------------------------------------------------------------------------
-- Table for Campuses
-- This table stores a list of campuses to ensure data consistency across the application.
-- ------------------------------------------------------------------------------------
CREATE TABLE Campuses (
    CampusID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each campus.
    CampusName NVARCHAR(100) NOT NULL UNIQUE -- The name of the campus (e.g., 'Potchefstroom').
);

-- ------------------------------------------------------------------------------------
-- Table for Students
-- This table stores personal and academic details for all registered student users.
-- Updated to include a foreign key to the new Campuses table.
-- ------------------------------------------------------------------------------------
CREATE TABLE Students (
    StudentID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each student.
    StudentNumber NVARCHAR(50) NOT NULL UNIQUE, -- The student's unique academic number.
    FullName NVARCHAR(255) NOT NULL, -- The full name of the student.
    Email NVARCHAR(255) NOT NULL UNIQUE, -- The student's email, used for login and notifications.
    CampusID INT NOT NULL, -- Foreign key linking to the Campuses table.
    PasswordHash NVARCHAR(255) NOT NULL, -- Hashed password for secure authentication.
    ContactNumber NVARCHAR(20), -- Student's phone number for SMS notifications.
    ProfileUpdated DATETIME DEFAULT GETDATE(), -- Timestamp of the last profile update.
    IsActive BIT NOT NULL DEFAULT 1, -- Status of the account (active or deactivated).
    FOREIGN KEY (CampusID) REFERENCES Campuses(CampusID)
);

-- ------------------------------------------------------------------------------------
-- Table for Clinic Staff
-- This table stores login and profile information for clinic staff members.
-- ------------------------------------------------------------------------------------
CREATE TABLE ClinicStaff (
    StaffID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each staff member.
    FullName NVARCHAR(255) NOT NULL, -- The full name of the staff member.
    Email NVARCHAR(255) NOT NULL UNIQUE, -- The staff's email, used for login.
    PasswordHash NVARCHAR(255) NOT NULL, -- Hashed password for secure authentication.
    IsActive BIT NOT NULL DEFAULT 1 -- Status of the account (active or deactivated).
);

-- ------------------------------------------------------------------------------------
-- Table for Administrators
-- This table stores login and profile information for system administrators.
-- ------------------------------------------------------------------------------------
CREATE TABLE Administrators (
    AdminID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each administrator.
    FullName NVARCHAR(255) NOT NULL, -- The full name of the administrator.
    Email NVARCHAR(255) NOT NULL UNIQUE, -- The admin's email, used for login.
    PasswordHash NVARCHAR(255) NOT NULL, -- Hashed password for secure authentication.
    IsActive BIT NOT NULL DEFAULT 1 -- Status of the account (active or deactivated).
);

-- ------------------------------------------------------------------------------------
-- Table for Appointments
-- This table stores all booking details, linking students and staff.
-- Updated to include a PaymentStatus field as shown in the interface.
-- ------------------------------------------------------------------------------------
CREATE TABLE Appointments (
    AppointmentID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each appointment.
    StudentID INT NOT NULL, -- Foreign key linking to the Students table.
    StaffID INT, -- Foreign key linking to the ClinicStaff table; NULL if not assigned.
    AppointmentDate DATE NOT NULL, -- The date of the appointment.
    AppointmentTime TIME NOT NULL, -- The time of the appointment.
    ClinicType NVARCHAR(100) NOT NULL, -- The type of clinic or reason for the visit.
    Notes NVARCHAR(MAX), -- Optional notes added by the student or staff.
    Status NVARCHAR(50) NOT NULL, -- The current status of the appointment (e.g., 'Pending', 'Approved').
    PaymentStatus NVARCHAR(50) NOT NULL, -- Status of payment (e.g., 'Paid', 'Pending', 'N/A').
    CreatedDate DATETIME DEFAULT GETDATE(), -- Timestamp when the appointment was created.
    LastUpdated DATETIME DEFAULT GETDATE(), -- Timestamp of the last update to the appointment.
    FOREIGN KEY (StudentID) REFERENCES Students(StudentID),
    FOREIGN KEY (StaffID) REFERENCES ClinicStaff(StaffID)
);

-- ------------------------------------------------------------------------------------
-- Table for FAQ (Frequently Asked Questions)
-- This table stores content for the FAQ section, which is managed by administrators.
-- ------------------------------------------------------------------------------------
CREATE TABLE FAQs (
    FAQID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each FAQ entry.
    Question NVARCHAR(MAX) NOT NULL, -- The question text.
    Answer NVARCHAR(MAX) NOT NULL, -- The answer text.
    Category NVARCHAR(100), -- The category of the question for easy searching.
    LastUpdated DATETIME DEFAULT GETDATE() -- Timestamp of the last update to the FAQ.
);

-- ------------------------------------------------------------------------------------
-- Table for Announcements
-- This table stores clinic-wide announcements that are broadcasted to all users.
-- ------------------------------------------------------------------------------------
CREATE TABLE Announcements (
    AnnouncementID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each announcement.
    Title NVARCHAR(255) NOT NULL, -- The title of the announcement.
    Message NVARCHAR(MAX) NOT NULL, -- The full text of the announcement.
    CreatedDate DATETIME DEFAULT GETDATE() -- Timestamp when the announcement was created.
);

-- ------------------------------------------------------------------------------------
-- Table for AnnouncementCampusLinks
-- A linking table to allow announcements to be targeted to specific campuses.
-- This supports the "Select Campuses for this Alert" feature.
-- ------------------------------------------------------------------------------------
CREATE TABLE AnnouncementCampusLinks (
    AnnouncementID INT NOT NULL,
    CampusID INT NOT NULL,
    PRIMARY KEY (AnnouncementID, CampusID),
    FOREIGN KEY (AnnouncementID) REFERENCES Announcements(AnnouncementID),
    FOREIGN KEY (CampusID) REFERENCES Campuses(CampusID)
);


-- ------------------------------------------------------------------------------------
-- Table for Feedback
-- This table stores user feedback submissions, which are moderated by administrators.
-- ------------------------------------------------------------------------------------
CREATE TABLE Feedback (
    FeedbackID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each feedback submission.
    StudentID INT NOT NULL, -- Foreign key linking to the Students table.
    Comment NVARCHAR(MAX) NOT NULL, -- The full text of the feedback.
    Rating INT, -- Optional rating provided by the user.
    Status NVARCHAR(50) NOT NULL, -- The moderation status (e.g., 'Pending', 'Approved').
    SubmittedDate DATETIME DEFAULT GETDATE(), -- Timestamp when the feedback was submitted.
    FOREIGN KEY (StudentID) REFERENCES Students(StudentID)
);

-- ------------------------------------------------------------------------------------
-- Table for Staff Availability
-- This table stores the available time slots for clinic staff to be booked by students.
-- ------------------------------------------------------------------------------------
CREATE TABLE StaffAvailability (
    AvailabilityID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each availability slot.
    StaffID INT NOT NULL, -- Foreign key linking to the ClinicStaff table.
    AvailableDate DATE NOT NULL, -- The date the staff is available.
    StartTime TIME NOT NULL, -- The start time of the availability window.
    EndTime TIME NOT NULL, -- The end time of the availability window.
    FOREIGN KEY (StaffID) REFERENCES ClinicStaff(StaffID)
);

-- ------------------------------------------------------------------------------------
-- Table for SystemSettings
-- This table stores global configuration settings for the system, such as
-- the daily appointment limit and booking rules, as shown in the admin interface.
-- ------------------------------------------------------------------------------------
CREATE TABLE SystemSettings (
    SettingID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for the setting.
    SettingName NVARCHAR(255) NOT NULL UNIQUE, -- The name of the setting (e.g., 'DailyAppointmentLimit').
    SettingValue NVARCHAR(MAX) NOT NULL, -- The value of the setting.
    LastUpdated DATETIME DEFAULT GETDATE() -- Timestamp of the last update.
);

-- ------------------------------------------------------------------------------------
-- Table for System Logs
-- This table serves as an audit trail for system events, errors, and user actions.
-- ------------------------------------------------------------------------------------
CREATE TABLE SystemLogs (
    LogID INT IDENTITY(1,1) PRIMARY KEY, -- Unique identifier for each log entry.
    LogType NVARCHAR(50) NOT NULL, -- The type of log (e.g., 'Error', 'Authentication', 'Audit').
    Message NVARCHAR(MAX) NOT NULL, -- The detailed log message.
    LoggedTime DATETIME DEFAULT GETDATE(), -- The timestamp of the log entry.
    UserID INT, -- The ID of the user associated with the log, if applicable.
    UserRole NVARCHAR(50) -- The role of the user (e.g., 'Student', 'Admin') for context.

);
