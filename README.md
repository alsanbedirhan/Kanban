Kanflow is a modern, Single Page Application (SPA) task management tool designed to streamline workflow efficiency using Kanban methodology. Built with a robust .NET Core backend and a responsive frontend interface.

Live Demo: www.kanflow.online

Kanflow allows teams and individuals to visualize their work, limit work-in-progress, and maximize efficiency. The project was developed to demonstrate advanced backend architecture, SPA implementation, and secure user management practices.

# Key Features
* Kanban Boards: Drag-and-drop interface for managing tasks across different stages.*
* Secure Authentication: ASP.NET Identity integration with Email Verification.
* SPA Architecture: Seamless user experience with no page reloads, powered by .NET MVC.
* Email Integration: Automated email notifications and invites using Mailjet.
* Responsive Design: Fully functional across desktop and mobile devices.

# Tech Stack
 ## Backend
* Framework: ASP.NET Core [.NET 10]
* Architecture: N-Layer / Clean Architecture
* ORM: Entity Framework Core
* Database: SQL Server
* Authentication: ASP.NET Identity

 ## Frontend
* Type: Single Page Application (SPA)
* Libraries: JavaScript (ES6+), jQuery, Bootstrap
* Communication: RESTful API calls

# Architecture & Design
The project follows the Clean Architecture principles to ensure separation of concerns and maintainability:
* Core/Entities: Contains domain entities and business logic (e.g., Kanban.Entities).
* Data Access: Repository pattern implementation using Entity Framework Core.
* Service Layer: Business rules and service abstractions (e.g., EmailService with Mailjet).
* Presentation (Web): The SPA interface and API endpoints.
