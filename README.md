# crm-backend
This is the backend repository from Medpho CRM

This repository contains the backend implementation for the Medpho CRM system, built on a simplified monolithic architecture. The primary goal is to manage doctor-referral relationships and patient appointment workflows while providing robust data for analytics via Metabase.

The system is designed around the core entities of Users (agents/NDMs), Doctors, and Patients/OPD Bookings. The key functional modules are:


User Management : Handles roles like super_admin, team_lead, and various sales agents (online_sales, offline_sales).



Doctor Relationship Management : Tracks doctor details, physical/virtual meetings, and engagement scores.





Lead Management : Manages patient leads, OPD bookings, and conversion to IPD.





Revenue & Commission Management : Tracks hospital bills and calculates doctor commissions.




Analytics & Reporting : Provides data points for performance analysis, including meeting metrics, referral patterns, and geographical cluster performance.
