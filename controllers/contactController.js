import { Filter } from "bad-words";
import mailjet from "../config/mailjet.js";

const filter = new Filter();
filter.addWords("bitcoin", "crypto", "viagra", "loan", "casino", "forex", "porn", "betting");

export const sendContactEmail = async (req, res) => {
   const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Missing required fields." });
  }

  if (filter.isProfane(message) || filter.isProfane(name)) {
    console.warn(`Blocked spam or profanity from ${email}`);
    return res.status(400).json({ success: false, error: "Inappropriate or spammy content detected." });
  }

  const linkPattern = /(http:\/\/|https:\/\/|www\.)/i;
  if (linkPattern.test(message)) {
    console.warn(`Message contains link, possible spam from ${email}`);
    return res.status(400).json({ success: false, error: "Links are not allowed in messages." });
  }


  try {
    const request = mailjet
      .post("send", { version: "v3.1" })
      .request({
        Messages: [
          {
            From: {
              Email: process.env.MJ_SENDER_EMAIL,
              Name: process.env.MJ_SENDER_NAME,
            },
            To: [
              {
                Email: process.env.CONTACT_RECEIVER,
                Name: "Site Admin",
              },
            ],
            Subject: `Message from ${name} at Endless Forge`,
            TextPart: `New message from ${name} (${email}):\n\n${message}`,
            HTMLPart: `
              <html>
                <head>
                  <meta charset="UTF-8" />
                  <meta name="color-scheme" content="light dark" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <style>
                    body {
                      margin: 0;
                      padding: 0;
                      background-color: #f7f9fc;
                      font-family: Arial, Helvetica, sans-serif;
                      color: #333;
                    }
                    .container {
                      max-width: 600px;
                      margin: 40px auto;
                      background: #ffffff;
                      border-radius: 8px;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                      overflow: hidden;
                    }
                    .header {
                      background: #111827;
                      color: #ffffff;
                      padding: 20px;
                      text-align: center;
                    }
                    .header h1 {
                      margin: 0;
                      font-size: 20px;
                      letter-spacing: 0.5px;
                    }
                    .content {
                      padding: 25px 30px;
                      line-height: 1.6;
                    }
                    .content h2 {
                      font-size: 18px;
                      margin-bottom: 15px;
                      color: #111827;
                    }
                    .content p {
                      margin: 8px 0;
                    }
                    .label {
                      font-weight: bold;
                      color: #374151;
                    }
                    .footer {
                      text-align: center;
                      font-size: 13px;
                      color: #6b7280;
                      background: #f3f4f6;
                      padding: 15px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>Endless Forge</h1>
                    </div>
                    <div class="content">
                      <h2>Endless Forge - Contact Form from ${name}</h2>
                      <p><span class="label">Name:</span> ${name}</p>
                      <p><span class="label">Email:</span> ${email}</p>
                      <p><span class="label">Message:</span></p>
                      <p style="white-space: pre-wrap;">${message}</p>
                    </div>
                    <div class="footer">
                      Sent from the <b>Endless Forge</b> Contact Form<br />
                      <small>© ${new Date().getFullYear()} Endless Forge. All rights reserved.</small>
                    </div>
                  </div>
                </body>
              </html>
            `,
          },
        ],
      });

    await request;
    console.log(`Email sent from ${email} (${name})`);
    res.json({ success: true, message: "Email sent successfully!" });
  } catch (err) {
    console.error("[Mailjet Error]", err?.response?.data || err.message);
    res.status(500).json({ success: false, error: "Failed to send email." });
  }
};