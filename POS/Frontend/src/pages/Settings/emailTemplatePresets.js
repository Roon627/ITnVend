export const FRIENDLY_INVOICE_NOTE = `Thank you for shopping with us! If you need any help, reply to this message or call our support team.`;

export const FRIENDLY_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your order recap</title>
<style>
  body { margin: 0; background: #f6f7fb; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; }
  .wrapper { width: 100%; padding: 24px 12px; box-sizing: border-box; }
  .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12); }
  .header { background: linear-gradient(135deg, #6366f1, #22d3ee); padding: 32px 32px 28px; color: #ffffff; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .pill { display: inline-block; margin-top: 12px; padding: 6px 16px; border-radius: 999px; background: rgba(255, 255, 255, 0.25); color: #ffffff; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; }
  .content { padding: 32px; }
  .content h2 { font-size: 20px; margin: 0 0 12px; }
  .summary { margin: 24px 0; padding: 16px; background: #f1f5f9; border-radius: 16px; border: 1px solid #e2e8f0; }
  .summary strong { display: block; margin-bottom: 8px; }
  .summary p { margin: 6px 0; }
  .items { margin: 24px 0; }
  .items h3 { margin: 0 0 12px; font-size: 16px; }
  .items ul { list-style: none; padding: 0; margin: 0; }
  .items li { margin-bottom: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid #e2e8f0; background: #ffffff; }
  .footer { padding: 0 32px 32px; text-align: center; font-size: 12px; color: #64748b; }
  a.button { display: inline-block; margin-top: 24px; padding: 14px 26px; background: #6366f1; color: #ffffff !important; text-decoration: none; border-radius: 14px; font-weight: 600; letter-spacing: 0.05em; }
  @media (max-width: 520px) {
    .header { padding: 28px 20px; }
    .content { padding: 28px 20px; }
    .summary { padding: 14px; }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Thank you, {{customer_name}}!</h1>
        <span class="pill">Order {{order_id}}</span>
      </div>
      <div class="content">
        <h2>Your goodies are on the way.</h2>
        <p>We received your order and created invoice <strong>#{{invoice_id}}</strong>. Here is a quick recap you can keep for your records.</p>
        <div class="summary">
          <strong>Order snapshot</strong>
          <p><strong>Status:</strong> {{status}}</p>
          <p><strong>Total:</strong> {{total}}</p>
          <p><strong>Payment method:</strong> {{payment_method}}</p>
          <p><strong>Preorder:</strong> {{preorder_flag}}</p>
        </div>
        <div class="items">
          <h3>What you ordered</h3>
          {{items_html}}
        </div>
        <p>If anything looks off, just reply to this email and our team will swoop in to help. We are always happy to hear from you!</p>
      </div>
      <div class="footer">
        <p>Sent with a smile from {{outlet_name}}.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

export const FRIENDLY_QUOTE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your quotation request</title>
<style>
  body { margin: 0; background: #f6f8ff; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
  .wrapper { width: 100%; padding: 24px 12px; box-sizing: border-box; }
  .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 18px 40px rgba(30, 58, 138, 0.12); }
  .header { background: linear-gradient(140deg, #34d399, #60a5fa); padding: 30px 30px 26px; color: #ffffff; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .content { padding: 30px; }
  .content h2 { margin: 0 0 14px; font-size: 19px; }
  .badge { display: inline-block; margin-bottom: 18px; padding: 6px 16px; border-radius: 999px; background: rgba(20, 184, 166, 0.2); color: #0f766e; font-weight: 600; letter-spacing: 0.05em; }
  .summary { margin: 22px 0; padding: 16px; border-radius: 16px; border: 1px solid #dbeafe; background: #eff6ff; }
  .summary p { margin: 8px 0; }
  .items ul { list-style: none; padding: 0; margin: 0; }
  .items li { margin-bottom: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid #bfdbfe; background: #ffffff; }
  .footer { padding: 0 30px 30px; text-align: center; font-size: 12px; color: #64748b; }
  @media (max-width: 520px) {
    .header { padding: 26px 20px; }
    .content { padding: 26px 20px; }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>We received your request, {{contact_first}}!</h1>
      </div>
      <div class="content">
        <span class="badge">Quote #{{quote_id}}</span>
        <h2>Our team is already crafting the perfect reply.</h2>
        <p>Thank you for reaching out to {{outlet_name}}. We will review your details and get back to you shortly with pricing and availability.</p>
        <div class="summary">
          <p><strong>Submitted:</strong> {{submitted_at}}</p>
        </div>
        <div class="items">
          <h3>Requested items</h3>
          {{items_html}}
        </div>
        <p>If you would like to add more information, reply to this email any time. We love extra details!</p>
      </div>
      <div class="footer">
        <p>Warmly,<br />The {{outlet_name}} crew</p>
      </div>
    </div>
  </div>
</body>
</html>`;

export const FRIENDLY_QUOTE_REQUEST_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>New quotation request</title>
<style>
  body { margin: 0; background: #f4f6fb; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; }
  .wrapper { width: 100%; padding: 24px 12px; box-sizing: border-box; }
  .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 16px 38px rgba(15, 23, 42, 0.14); }
  .header { background: linear-gradient(135deg, #f59e0b, #f97316); padding: 28px 32px; color: #ffffff; }
  .header h1 { margin: 0; font-size: 23px; }
  .content { padding: 30px; }
  .summary { display: grid; gap: 12px; }
  .summary-item { border-radius: 14px; background: #fff7ed; border: 1px solid #fed7aa; padding: 12px 14px; }
  .summary-item strong { display: block; font-size: 12px; color: #b45309; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 4px; }
  .items { margin-top: 24px; }
  .items ul { list-style: none; padding: 0; margin: 0; }
  .items li { margin-bottom: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid #fed7aa; background: #ffffff; }
  .footer { padding: 0 30px 30px; font-size: 12px; color: #6b7280; }
  @media (max-width: 560px) {
    .content { padding: 26px 20px; }
    .header { padding: 24px 20px; }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>New quote request from {{contact_name}}{{company_suffix}}</h1>
      </div>
      <div class="content">
        <div class="summary">
          <div class="summary-item">
            <strong>Contact</strong>
            <span>{{contact_name}}</span>
            <span>{{contact_email}}</span>
            <span>{{phone}}</span>
          </div>
          <div class="summary-item">
            <strong>Submission type</strong>
            <span>{{submission_type}}</span>
            <span>Existing account: {{existing_customer_ref}}</span>
            <span>Registration: {{registration_number}}</span>
          </div>
          <div class="summary-item">
            <strong>Quote details</strong>
            <span>ID: {{quote_id}}</span>
            <span>Invoice ID: {{invoice_id}}</span>
            <span>Items: {{item_count}}</span>
            <span>Submitted: {{submitted_at}}</span>
          </div>
        </div>
        <div class="items">
          <h3>Items requested</h3>
          {{items_html}}
        </div>
        <div style="margin-top: 20px; padding: 14px; border-radius: 14px; background: #ecfeff; border: 1px solid #bae6fd;">
          <strong>Extra notes</strong>
          <p>{{details}}</p>
        </div>
      </div>
      <div class="footer">
        <p>Make someone smile today. Reply to the customer and update the quote right from the POS.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

export const FRIENDLY_STAFF_ORDER_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>New order received</title>
<style>
  body { margin: 0; background: #f8fafc; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; }
  .card { max-width: 640px; margin: 18px auto; background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 8px 24px rgba(2,6,23,0.08); }
  .header { display:flex; align-items:center; gap:12px; }
  .title { font-size:16px; font-weight:700; }
  .meta { color:#475569; font-size:13px; }
  .items { margin-top:12px; }
  .items li { margin-bottom:6px; }
  .footer { margin-top:14px; font-size:13px; color:#64748b; }
  @media (max-width:560px) { .card { margin: 12px; padding: 14px; } }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">New order received</div>
    </div>
    <div class="meta">Order <strong>#{{order_id}}</strong> — Invoice <strong>#{{invoice_id}}</strong></div>
    <div class="items">
      <p><strong>Customer:</strong> {{customer_name}}</p>
      <p><strong>Total:</strong> {{total}}</p>
      <h4>Items</h4>
      {{items_html}}
    </div>
    <div class="footer">Open the POS to view and process this order.</div>
  </div>
</body>
</html>`;

export const FRIENDLY_PASSWORD_SUBJECT = 'Reset your ITnVend password';

export const FRIENDLY_PASSWORD_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Password reset</title>
<style>
  body { margin: 0; background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; }
  .wrapper { width: 100%; padding: 24px 12px; box-sizing: border-box; }
  .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
  .header { background: linear-gradient(135deg, #6366f1, #a855f7); padding: 32px; color: #ffffff; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .content { padding: 30px; }
  .content p { margin: 12px 0; line-height: 1.6; }
  .button { display: inline-block; margin: 24px 0 16px; padding: 14px 28px; background: #6366f1; color: #ffffff !important; text-decoration: none; border-radius: 14px; font-weight: 600; letter-spacing: 0.05em; }
  .footer { padding: 0 30px 30px; font-size: 12px; color: #64748b; text-align: center; }
  @media (max-width: 520px) {
    .header { padding: 28px 20px; }
    .content { padding: 26px 20px; }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Hello {{name}},</h1>
      </div>
      <div class="content">
        <p>We received a request to reset the password for your ITnVend account. If this was you, tap the button below to choose a new password.</p>
        <p style="text-align: center;">
          <a class="button" href="{{reset_link}}">Reset password</a>
        </p>
  <p>This link stays active for the next 30 minutes. If you didn't ask for a password reset, you can safely ignore this email and your password will stay the same.</p>
      </div>
      <div class="footer">
        <p>Need help? Reply to this message and our team will assist you right away.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
