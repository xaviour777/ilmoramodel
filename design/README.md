# Principal design (reference only)

Design mockups for the new principal look. Not app code: copy the look into the Next.js app.

- `ilmora.css` — shared colours, card, button, chip and sidebar styles
- `HomeV2.dc.html` — principal Home
- `Sidebar.dc.html` — collapsible sidebar; `Mobile.dc.html` — phone layout with bottom bar
- One file per page: Attendance, Notices, Classes, Exams, AITools, Students, Staff, Admissions, Fees, Reports, Settings

Markup is inside `<x-dc>`; `{{name}}` holes and the script at the bottom hold the sample data.
