const createVerificationEmail = ({ title, message, code }) => ({
    text: `${title}\n\n${message}\n\nVerification code: ${code}\n\nThis code expires in 10 minutes.`,
    html: `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 32px;background:#b91c1c;color:#ffffff;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;">Chick N Pastil</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:32px;color:#111827;">${title}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#4b5563;">${message}</p>
                <div style="margin:0 0 24px;padding:20px 16px;text-align:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
                  <div style="font-size:13px;line-height:20px;color:#9a3412;text-transform:uppercase;letter-spacing:1.5px;">Verification code</div>
                  <div style="margin-top:6px;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:#b91c1c;">${code}</div>
                </div>
                <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">This code expires in <strong>10 minutes</strong>. If you did not request this code, you can ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;text-align:center;color:#9ca3af;">
                Chick N Pastil account security
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
});

module.exports = { createVerificationEmail };
