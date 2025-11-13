import nodemailer from 'nodemailer';

// Minimal mail helper: uses SMTP env vars when present, otherwise logs to console in non-production.
// Accepts optional `fromOverride` and `replyTo` so callers can set reply-to addresses.
export async function sendMail({ to, subject, html, text, fromOverride, replyTo }) {
    const from = fromOverride || process.env.MAIL_FROM || 'no-reply@itnvend.com';
    const defaultReplyTo = process.env.MAIL_REPLY_TO || null;
    // If no SMTP configured, log in development instead of failing
    const hasSmtp = !!(process.env.SMTP_URL || process.env.SMTP_HOST);
    if (!hasSmtp) {
        // If SMTP is not configured, always log the outgoing message so admins
        // can retrieve temporary passwords or debug delivery in production.
        console.warn('[mail] SMTP not configured - logging message instead of sending.');
        console.log('[mail] from=', from, 'replyTo=', replyTo || defaultReplyTo, 'to=', to, 'subject=', subject);
        if (text) console.log('[mail] text=', text);
        if (html) console.log('[mail] html=', html);
        return { ok: true, dev: true };
    }

    const transporter = process.env.SMTP_URL
        ? nodemailer.createTransport(process.env.SMTP_URL)
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_PORT === '465' || process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        });

    const mailOptions = { from, to, subject, text, html };
    const effectiveReplyTo = replyTo || defaultReplyTo;
    if (effectiveReplyTo) mailOptions.replyTo = effectiveReplyTo;

    const info = await transporter.sendMail(mailOptions);
    return info;
}
