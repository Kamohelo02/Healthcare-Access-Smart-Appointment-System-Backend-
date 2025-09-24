-- Core identity table
CREATE TABLE UserAccount (
    user_id INT IDENTITY(1,1) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(25),
    password_hash VARCHAR(255) NOT NULL,
    account_status BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    role VARCHAR(50) NOT NULL
);

-- Extends User with academic details for students
CREATE TABLE Student (
    user_id INT PRIMARY KEY REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    student_number VARCHAR(20) UNIQUE NOT NULL
);

-- Extends User with professional details for clinic personnel
CREATE TABLE Staff (
    user_id INT PRIMARY KEY REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    position VARCHAR(255) NOT NULL,
    is_admin BIT DEFAULT 0
);

-- Tracks -- Appointment workflow tables

appointment requests before approval/rescheduling
CREATE TABLE Booking (
    booking_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'requested',
    requested_time_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    processed_at DATETIME,
    service_id INT NOT NULL FOREIGN KEY REFERENCES ServiceType(service_id) ON DELETE CASCADE;
);

-- Finalized appointments derived from approved bookings
CREATE TABLE Appointment (
    appointment_id INT IDENTITY(1,1) PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES Booking(booking_id) ON DELETE CASCADE,
    date_and_time DATETIME NOT NULL,
    status VARCHAR(25) DEFAULT 'scheduled',
    duration_minutes INT;

);

-- Manages staff availability windows for scheduling
CREATE TABLE TimeSlot (
    slot_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    status VARCHAR(20) DEFAULT 'available'
);
-- Communication tables

CREATE TABLE Notification (
    notification_id INT IDENTITY(1,1) PRIMARY KEY,
    appointment_id INT NOT NULL REFERENCES Appointment(appointment_id) ON DELETE CASCADE,
    content VARCHAR(MAX) NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    type VARCHAR(50),
    sent_at DATETIME DEFAULT GETDATE()
);

-- Clinic-wide announcements
CREATE TABLE Announcement (
    announcement_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content VARCHAR(500) NOT NULL,
    created_at DATETIME DEFAULT GETDATE()
);

-- Patient feedback about appointments or services
CREATE TABLE Feedback (
    feedback_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    appointment_id INT NOT NULL REFERENCES Appointment(appointment_id) ON DELETE CASCADE,
    message VARCHAR(MAX) NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    submitted_at DATETIME DEFAULT GETDATE(),
    status VARCHAR(20) DEFAULT 'pending'
);

-- service type table predefined services for clients 
CREATE TABLE ServiceType (
    service_id INT IDENTITY(1,1) PRIMARY KEY,
    category VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NULL
);

-- System management tables

-- Configurable business rules
CREATE TABLE SystemConfiguration (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT GETDATE()
);

-- Audit trail for security/compliance
CREATE TABLE AuditLog (
    audit_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    log_type VARCHAR(50) NOT NULL,
    message VARCHAR(255) NOT NULL,
    logged_time DATETIME DEFAULT GETDATE()
);

-- Predefined answers for common student queries
CREATE TABLE FAQ (
    faq_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    question VARCHAR(255) NOT NULL,
    answer VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    created_at DATETIME DEFAULT GETDATE()
);

-- Additional table for appointment rescheduling history
CREATE TABLE AppointmentHistory (
    history_id INT IDENTITY(1,1) PRIMARY KEY,
    appointment_id INT NOT NULL REFERENCES Appointment(appointment_id) ON DELETE CASCADE,
    old_date_time DATETIME,
    new_date_time DATETIME,
    reason VARCHAR(255),
    changed_by INT REFERENCES UserAccount(user_id),
    changed_at DATETIME DEFAULT GETDATE()
);
