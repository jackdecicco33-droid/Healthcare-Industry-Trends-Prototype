# Figma Make Prompt

Build a polished healthcare consulting resource website from the attached files:

- `data/resources.json`
- `data/service-lines.json`
- `data/source-index.json`
- `index.html`
- `styles.css`
- `app.js`

Goal: create a Figma Make website/prototype that mirrors the VS Code site and can be published or refined in Figma Sites.

## Required pages/sections

1. Hero / Home
   - Title: Healthcare Consultant Resource Guide
   - Subtitle: searchable healthcare advisory resource hub
   - CTA buttons: Search resources, Review source trust

2. Service Lines
   - Use `service-lines.json`
   - Each service line card must include: service line name, “What this service line actually does,” focus pills, and “What consultants look for.”

3. Resource Library
   - Use `resources.json`
   - Add search, service line filter, level filter, category filter
   - Cards must include name, service line, level, category, organization, description, and external link

4. Source Trust
   - Use `source-index.json`
   - Cards must include source domain, URL, where it appears, and service lines
   - Add a credibility label such as professional association, government / primary source, industry media, learning platform, conference, or book source.

## Visual direction

Use the following style:
- Primary navy: #16527a
- Accent green: #5b9b3f
- Background: #eef2f6
- Card surface: #ffffff
- Font: Source Sans 3 or similar
- Rounded cards, light borders, strong consulting-style hierarchy
- Clean healthcare advisory tone, not playful

## Interaction requirements

- Search should filter resource cards.
- Service line, level, and category dropdowns or chips should filter the resource library.
- The page should be responsive for desktop and mobile.
- Add sticky navigation if practical.

## Do not include

- Patient data
- Client-confidential information
- Internal Impact Advisors documents
- Private project details

The website should feel similar to an internal consultant enablement microsite.
