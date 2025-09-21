-- Core identity table
CREATE TABLE UserAccount (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(25) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    account_status TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(50) NOT NULL
);

-- Students
CREATE TABLE Student (
    user_id INT PRIMARY KEY,
    student_number VARCHAR(20) UNIQUE NOT NULL,
    CONSTRAINT FK_Student_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE
);

-- Staff
CREATE TABLE Staff (
    user_id INT PRIMARY KEY,
    position VARCHAR(255) NOT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    CONSTRAINT FK_Staff_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE
);

-- Administrators
CREATE TABLE Administrator (
   user_id INT PRIMARY KEY,
   CONSTRAINT FK_Admin_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE
);

-- Booking
CREATE TABLE Booking (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    status VARCHAR(50),
    requested_time_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    CONSTRAINT FK_Booking_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE
);

-- Appointments
CREATE TABLE Appointment (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT,
    date_and_time DATETIME,
    status VARCHAR(25),
    notes VARCHAR(255),
    CONSTRAINT FK_Appointment_Booking FOREIGN KEY (booking_id) REFERENCES Booking(booking_id) ON DELETE CASCADE
);

-- TimeSlots
CREATE TABLE TimeSlot (
    slot_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    CONSTRAINT FK_TimeSlot_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE
);

-- Notifications
CREATE TABLE Notification (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(50),
    type VARCHAR(50),
    sent_at DATETIME,
    CONSTRAINT FK_Notification_Appointment FOREIGN KEY (appointment_id) REFERENCES Appointment(appointment_id) ON DELETE CASCADE
);

-- Announcements
CREATE TABLE Announcement (
    announcement_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    admin_id INT,
    CONSTRAINT FK_Announcement_Admin FOREIGN KEY (admin_id) REFERENCES Administrator(user_id) ON DELETE CASCADE
);

-- Feedback
CREATE TABLE Feedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    appointment_id INT NOT NULL,
    message TEXT,
    rating INT,
    submitted_at DATETIME NOT NULL,
    CONSTRAINT FK_Feedback_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE,
    CONSTRAINT FK_Feedback_Appointment FOREIGN KEY (appointment_id) REFERENCES Appointment(appointment_id) ON DELETE CASCADE
);

-- System Config
CREATE TABLE SystemConfiguration (
    configure_id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE AuditLog (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL,
    message VARCHAR(255) NOT NULL,
    logged_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    admin_id INT NOT NULL,
    CONSTRAINT FK_AuditLog_Admin FOREIGN KEY (admin_id) REFERENCES Administrator(user_id) ON DELETE CASCADE
);

-- FAQs
CREATE TABLE FAQ (
    faq_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    question VARCHAR(255),
    answer VARCHAR(255),
    category VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_FAQ_User FOREIGN KEY (user_id) REFERENCES UserAccount(user_id) ON DELETE CASCADE
);
