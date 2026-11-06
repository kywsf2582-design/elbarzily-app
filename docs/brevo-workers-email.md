# Brevo email from Cloudflare Workers — Staging

## Integration

The Worker email transport uses Brevo's transactional email HTTPS endpoint: `POST https://api.brevo.com/v3/smtp/email`. The request authenticates with the `api-key` header and sends a verified sender, recipient, subject, HTML, and text body. Cloudflare Worker code selects this transport with `MAIL_TRANSPORT=brevo-api`; the credential is read only from the `BREVO_API_KEY` secret. `BREVO_FROM`, `BREVO_SENDER_NAME`, `ADMIN_EMAIL`, and `APP_PUBLIC_URL` are non-secret Worker variables.

The Node server keeps the existing Nodemailer/SMTP transport. The Worker does not receive `SMTP_PASSWORD`, and no credential belongs in the application UI, Git, source files, or public build. Brevo requires the sender to be registered and verified before it will send transactional email. [1] [2]

## Credential safety

An SMTP password/key is not the API key used by the Brevo HTTP API. The SMTP credential that was pasted in the chat must be considered exposed: revoke or rotate it in Brevo and do not reuse it. Create a new Brevo API key for the HTTPS integration. Do not paste the new key into this chat; add it only as the Cloudflare Worker secret named `BREVO_API_KEY`.

The Cloudflare Worker currently has `APP_SESSION_SECRET`, but `BREVO_API_KEY` has not yet been added. The updated local code has not yet been deployed to the remote Staging Worker. Do not send a real OTP until the new API key is configured and the updated bundle is deployed.

## Validation

Local unit tests mock `fetch` and use a fake key; they do not contact Brevo or send mail. The test suite verifies the endpoint, key header, payload, missing-key fail-closed behavior, and suppression of provider response bodies. Actual delivery remains untested until a rotated/new Brevo API key is saved as a Worker secret and the updated Worker is deployed. The user designated a Staging inbox for one OTP test; use that inbox only after these setup steps.

## References

[1]: https://developers.brevo.com/docs/send-a-transactional-email "Brevo send a transactional email guide"
[2]: https://developers.brevo.com/reference/send-transac-email "Brevo send transactional email API reference"
[3]: https://developers.brevo.com/docs/smtp-integration "Brevo SMTP relay integration"
[4]: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/ "Cloudflare Workers TCP sockets"
