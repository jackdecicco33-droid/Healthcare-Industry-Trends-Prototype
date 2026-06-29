# Microsoft Forms live-response setup

The Microsoft Form iframe only displays and submits the form. Browsers cannot read
responses out of that iframe. A Power Automate flow must send each response to this
website's backend.

## 1. Run the complete website locally

```bash
npm install
npm start
```

Open `http://localhost:3001`. Use `npm start`, not `npm run dev`, when testing the
response API.

## 2. Deploy the Node website

Power Automate runs in Microsoft's cloud and cannot call `localhost`. Deploy this
folder to a Node-compatible host and confirm this URL returns JSON:

```text
https://YOUR-PUBLIC-DOMAIN/api/insights
```

Set a host environment variable named `FORMS_WEBHOOK_SECRET` to a long random
value. The server will require that value on all incoming form submissions.

Important: this starter stores responses in `insights.json`. Use persistent disk or
a database in production; hosts with an ephemeral filesystem can erase the file
during a restart or deployment.

## 3. Build the Power Automate flow

1. Create an **Automated cloud flow**.
2. Choose Microsoft Forms: **When a new response is submitted**.
3. Select the Healthcare Insights form.
4. Add Microsoft Forms: **Get response details**.
5. Use the same Form ID and select **Response Id** from the trigger.
6. Add the HTTP action.
7. Set Method to `POST`.
8. Set URI to:

   ```text
   https://YOUR-PUBLIC-DOMAIN/api/submit-insight
   ```

9. Add this header:

   ```text
   x-webhook-secret: YOUR_FORMS_WEBHOOK_SECRET
   ```

10. Set `Content-Type` to `application/json`.
11. Use this body, replacing each placeholder with the matching dynamic-content
    answer from **Get response details**:

```json
{
  "name": "NAME_ANSWER",
  "role": "ROLE_ANSWER",
  "sourceType": "SOURCE_TYPE_ANSWER",
  "title": "TITLE_ANSWER",
  "link": "LINK_ANSWER",
  "rating": "RATING_ANSWER",
  "takeaways": "TAKEAWAYS_ANSWER",
  "whyItMatters": "WHY_IT_MATTERS_ANSWER",
  "audience": "AUDIENCE_ANSWER"
}
```

The required fields are `name`, `title`, and `takeaways`. Save the flow and submit
one test response. Its run history should show HTTP status `200`.

## 4. Confirm the live display

Open the deployed website. The **Employee Industry Insights** section requests
`/api/insights` every five seconds, so a successful submission should appear
without a manual refresh.

## Common blockers

- **HTTP action unavailable:** Your Microsoft 365 plan may not include the premium
  HTTP connector. Use an Azure Logic App, Power Automate premium license, or replace
  this webhook with an approved connector/storage service.
- **401 Unauthorized:** The flow's `x-webhook-secret` does not match the deployed
  `FORMS_WEBHOOK_SECRET`.
- **400 Missing required fields:** One of `name`, `title`, or `takeaways` is blank
  or mapped from the trigger instead of **Get response details**.
- **Works locally but not from Power Automate:** The flow is still pointed at
  `localhost`; it needs the public HTTPS deployment URL.
- **Responses disappear after deployment:** Move storage from `insights.json` to a
  persistent database or storage service.
