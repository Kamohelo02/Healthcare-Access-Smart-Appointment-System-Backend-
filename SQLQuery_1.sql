Core identity table

-- Stores base user credentials and roles for all system actors (students, staff, admins)
CREATE TABLE UserAccount (
    user_id INT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
	name VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(25) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    account_status BIT DEFAULT 1,
	created_at DATETIME,
	role VARCHAR(50) NOT NULL ;
);



-- Extends User with academic details for patients. 
-- Links to bookings and medical records.
CREATE TABLE Student (
    user_id INT PRIMARY KEY REFERENCES UserAccount(user_id),
    student_number VARCHAR(20) UNIQUE NOT NULL
    
);

-- Extends User with professional details for clinic personnel.
-- Admins are staff members with is_admin=TRUE.
CREATE TABLE Staff (
    user_id INT PRIMARY KEY REFERENCES UserAccount(user_id)
    position VARCHAR(255) NOT NULL,
    is_admin BIT,
);

CREATE TABLE Administrator (
   user_id INT PRIMARY KEY REFERENCES UserAccount(user_id)
);

Appointment workflow tables

-- Tracks appointment requests before approval/rescheduling.
-- Status: requested/approved/rejected.
CREATE TABLE Booking (
    booking_id INT PRIMARY KEY,
    user_id INT,
    status VARCHAR(50),
    requested_time_date TIME,
    created_at DATETIME,
    processed_at DATETIME,
    CONSTRAINT FK_Booking_UserAccount FOREIGN KEY (user_id) REFERENCES UserAccount(user_id),
);


-- Finalized appointments derived from approved bookings.
-- Links to actual time slots and medical documentation.
CREATE TABLE Appointment (
    appointment_id INT PRIMARY KEY,
    booking_id INT,
    user_id INT NOT NULL,
    date_and_time TIME,
    status VARCHAR(25),
    notes VARCHAR(255),
    CONSTRAINT FK_Appointment_UserAccount FOREIGN KEY (user_id) REFERENCES UserAccount(user_id)
);



-- Manages staff availability windows for scheduling.
-- Status: available/booked/blocked.
CREATE TABLE TimeSlot (
    slot_id INT PRIMARY KEY,
    staff_id INT NOT NULL,
    date DATE NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    CONSTRAINT FK_TimeSlot_Staff FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);




Communication tables

CREATE TABLE Notification (
    notification_id INT PRIMARY KEY,
    appointment_id INT NOT NULL,
    content VARCHAR(MAX) NOT NULL,
    status VARCHAR(50),
    type VARCHAR(50),
    sent_at DATETIME,
    CONSTRAINT FK_Notification_Appointment FOREIGN KEY (appointment_id) REFERENCES Appointment(appointment_id)
);




-- Clinic-wide announcements (e.g., holiday closures).
-- Visible to students/staff based on audience targeting.
CREATE TABLE Announcement (
    announcement_id INT PRIMARY KEY,
    title VARCHAR(255),
    content VARCHAR(500),
    created_at DATETIMEOFFSET,
    admin_id INT,
    CONSTRAINT FK_Announcement_Admin FOREIGN KEY (admin_id) REFERENCES Administrator(admin_id)
);


-- Patient feedback about appointments or services.
-- Moderated by admins via status: pending/approved/rejected.
CREATE TABLE Feedback (
    feedback_id INT PRIMARY KEY,
    user_id INT NOT NULL,
    appointment_id INT NOT NULL,
    message VARCHAR(MAX),
    rating INT,
    submitted_at DATETIME NOT NULL,
    CONSTRAINT FK_Feedback_UserAccount FOREIGN KEY (user_id) REFERENCES UserAccount(user_id),
    CONSTRAINT FK_Feedback_Appointment FOREIGN KEY (appointment_id) REFERENCES Appointment(appointment_id)
);


System management tables

-- Configurable business rules (e.g., max appointments per day).
-- Key examples: 'booking_window_days', 'cancelation_period_hours'.
CREATE TABLE SystemConfiguration (
    configure_id INT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    created_at TIME
);


-- Audit trail for security/compliance. Tracks all CRUD operations.
CREATE TABLE AuditLog (
    audit_id INT PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL,
    message VARCHAR(255) NOT NULL,
    logged_time DATETIME,
    admin_id INT NOT NULL,
    CONSTRAINT FK_AuditLog_Admin FOREIGN KEY (admin_id) REFERENCES Administrator(admin_id)
);



-- Predefined answers for common student queries.
-- Categorized for quick retrieval (e.g., 'billing', 'visa_requirements').
CREATE TABLE FAQ (
    faq_id INT PRIMARY KEY,
	user_id INT NOT NULL;
    question VARCHAR(255),
    answer VARCHAR(255),
    category VARCHAR(100),
    created_at DATETIME
	CONSTRAINT FK_FAQ_UserAccount FOREIGN KEY (user_id) REFERENCES UserAccount
	);



