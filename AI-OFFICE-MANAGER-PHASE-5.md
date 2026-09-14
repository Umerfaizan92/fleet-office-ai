# Fleet Parlour AI Office Manager — Phase 5 Marketing Hub

Phase 5 adds a single planning and approval workspace for Fleet Parlour content, social posts, lead-generation offers and customer campaigns.

## New dashboard areas

### Content Studio

- Create one master content project.
- Select short video, YouTube video, carousel, image post or story.
- Select 9:16, 16:9, 4:5 or 1:1 format and target duration.
- Save the hook, caption, call to action and detailed editing prompt.
- Map one project to Facebook, Instagram, TikTok, YouTube and the website.
- Generate a separate approval item for every selected platform.
- Use only job media carrying recorded marketing consent.

The current build stores the complete edit plan and source-media permissions. Final video rendering, trimming, transitions, subtitles, music and logo overlays require a local FFmpeg rendering module, which is intentionally identified as the next build step rather than falsely shown as completed.

### Campaigns

- Draft offers, follow-ups, newsletters and lead-generation campaigns.
- Plan email, SMS, WhatsApp and social/website campaigns.
- Select opted-in contacts, past customers or unconverted leads.
- Automatically exclude customers whose marketing consent is off.
- Send every campaign to Approvals; creation never transmits it.

### Connections

The dashboard shows Website, WhatsApp Business, Facebook, Instagram, TikTok, YouTube, email and SMS separately. They remain `not connected` until the correct official API application, permissions, webhooks, public HTTPS callback and encrypted credentials are configured.

## Platform reality

- TikTok publishing requires its Content Posting API and approved scopes/app review.
- YouTube uploads require the YouTube Data API and authorised channel access.
- Facebook and Instagram publishing/lead access require Meta business assets, permissions and app review.
- WhatsApp automation requires WhatsApp Business Platform/Cloud API; a personal WhatsApp inbox must not be copied into this CRM.
- Email and SMS marketing require consent, identification and unsubscribe handling.

## Safety rules retained

- Personal contacts are excluded without storage.
- No post, campaign, email, SMS or WhatsApp message is sent automatically.
- Job media stays private unless marketing consent is recorded.
- Tokens must stay in backend secrets, never HTML or browser JavaScript.
- Advertising spend and campaign activation require separate explicit approval.

## Next technical build

1. Add the local FFmpeg renderer and preview/export screen.
2. Connect one platform at a time, starting with Meta or YouTube after HTTPS deployment.
3. Add platform-specific analytics and lead webhooks.
4. Add compliant email unsubscribe and WhatsApp opt-out processing.
5. Add ad-budget limits and a final spend-confirmation screen before enabling paid advertising.
