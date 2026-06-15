# Daily Voucher Report

Supabase Edge Function that emails the daily sales closeout with:

- Total sales by currency
- HSBC bank totals for transfer, debit card, and credit card payments
- Cash totals
- Attached voucher and customer ID photos saved in `sale-docs`
- Lists of bank payments missing voucher photos
- Lists of sales over MXN 1,000 missing customer ID photos

Required secrets:

- `RESEND_API_KEY`
- `DAILY_REPORT_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional secret:

- `DAILY_REPORT_FROM`, for example `CAsitakin <ventas@yourdomain.com>`

Schedule it once per day from Supabase Dashboard after store close, calling:

`daily-voucher-report`

For manual testing, call it with a date:

`daily-voucher-report?date=2026-06-15`
