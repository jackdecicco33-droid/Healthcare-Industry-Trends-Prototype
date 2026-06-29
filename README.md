# Healthcare Consultant Resource Guide Website

This is a VS Code-ready static website built from the uploaded Healthcare Consultant Resources Impact Advisors HTML guide.

It includes:

- Searchable resource library
- Filters by service line, consulting level, and resource category
- Service-line explanation cards
- Source trust index
- Figma handoff files
- Original HTML backup

## 1. Open in VS Code

1. Download and unzip this folder.
2. Open VS Code.
3. Click **File > Open Folder**.
4. Select this project folder.

## 2. Run locally

Install dependencies:

```bash
npm install
```

Start the local server:

```bash
npm run dev
```

Open the local URL that Vite prints in the terminal, usually:

```text
http://localhost:5173
```

Do not open `index.html` directly by double-clicking it. The site loads JSON files, so it should run through a local server.

## 3. Main files

```text
index.html                  Main page structure
styles.css                  Visual design and responsive layout
app.js                      Search, filters, and rendering logic
data/resources.json         Resource card database
data/service-lines.json     Service-line explanations
data/source-index.json      Source trust index
figma/                      Figma Make prompt, storyboard, design tokens
original-healthcare-consultant-guide.html  Original uploaded HTML reference
```

## 4. How to edit resources

Open `data/resources.json` and add or edit entries like this:

```json
{
  "serviceLine": "Revenue Cycle",
  "panel": "revenue-cycle",
  "level": "Analyst",
  "category": "Credentials to Start",
  "name": "CRCR",
  "organization": "Certified Revenue Cycle Representative · HFMA",
  "description": "Best starting point for understanding the patient-to-payment revenue cycle and common RCM terminology.",
  "url": "https://www.hfma.org/certifications/crcr/"
}
```

Save the file and refresh the browser.

## 5. How to connect this workflow to Figma

There are three practical connection options.

### Option A — Use Figma Make as the prototype/design builder

1. Open Figma Make.
2. Create a new Make project.
3. Open `figma/FIGMA_MAKE_PROMPT.md`.
4. Copy the full prompt into Figma Make.
5. Attach or paste these files:
   - `data/resources.json`
   - `data/service-lines.json`
   - `data/source-index.json`
   - `index.html`
   - `styles.css`
   - `app.js`
6. Ask Figma Make to generate a website/prototype from those files.

### Option B — Use Figma for VS Code

Figma for VS Code lets developers inspect Figma designs from inside VS Code. Use it when you have a Figma design file and want to implement it accurately in code.

General flow:

1. Install the Figma for VS Code extension.
2. Sign in to your Figma account.
3. Open your Figma design file from VS Code.
4. Use the design as a visual reference while editing `styles.css` and components.

### Option C — Use Figma Code Connect for component mapping

Code Connect is for linking Figma design-system components to real code components. Use it later if you turn this into React components and your account supports Code Connect.

This starter project is vanilla HTML/CSS/JS, so Code Connect is optional and not required.

## 6. Push to GitHub

```bash
git init
git add .
git commit -m "Initial healthcare consultant resource website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/healthcare-consultant-resource-guide.git
git push -u origin main
```

## 7. Publish with GitHub Pages

1. Open the repository on GitHub.
2. Go to **Settings > Pages**.
3. Choose **Deploy from a branch**.
4. Select branch: `main`.
5. Select folder: `/root`.
6. Save.

GitHub will generate a live website URL.

## 8. Privacy rules

Do not add:

- Patient data
- Client-confidential information
- Internal company documents
- Private implementation screenshots
- Employee data
- Non-public pricing or contract details

Use public resources only.
