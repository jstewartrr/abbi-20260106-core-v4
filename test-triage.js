// Test the email triage API with real email from Snowflake

const testEmail = {
  id: "5e218689-3a6a-4efa-b0d8-f2b8290457dc",
  outlook_message_id: "AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MABGAAAAAAAgk0VHyOvbRaPMAcLLlPQLBwBtqPK5EteySrpFMqSnAflJAAGzqEipAABtqPK5EteySrpFMqSnAflJAARczBu4AAA=",
  subject: "RE: TPM x MGC Call Cadence Update",
  sender: "rfisher@middleground.com",
  recipient_email: "john@middleground.com",
  folder_name: "01.02 Scot",
  received_at: "2025-12-10 14:27:59",
  has_attachments: false,
  body_content: `Hi Rick and Zach,

See email from Omar below. @Rick Brawn, a call with Omar would be useful here to align on weekly call direction going forward. @Zach Spencer, obviously want to be aligned with you as well.

The agenda for the Friday calls will be centered around focus items selected by the deal team that week:

1. Every week:
   a. Provide update on selected focus items (Determined by MGC Deal Team)
   b. Provide update on FCF and 3rd Party Spend.

2. Additional Topics:
   a. 2nd Week of the Month: Commercial Pipeline Review
   b. 3rd Week of the Month: Review of Monthly Financials

Thanks

Rob Fisher
Senior Associate, MPO

---
From: Omar Medina <Omar.Medina@tpmmfg.com>
Sent: Wednesday, December 10, 2025 9:17 AM
To: Rob Fisher <rfisher@middleground.com>
Cc: Brian Marston; Rick Brawn

Hi Rob,

We are aligned on the weekly calls.

Would you mind cancelling the current invite you sent out and send us four recurring meeting invites as follow to the appropriate MGC attendees, BOD, Brian and I?
• Week 1 – Ops
• Week 2 – Sales
• Week 3 – Finance
• Week 4 – BOD Strategic Initiatives

Not everyone from our side needs to be on every call since we do have some sensitive topics that we don't want everyone involved in, so I can forward the invites to our team accordingly.

Please let me know if you have any further questions or comments at your convenience. – thanks`
};

async function testTriage() {
  console.log('Testing email triage...\n');
  console.log('Email Subject:', testEmail.subject);
  console.log('From:', testEmail.sender);
  console.log('Folder:', testEmail.folder_name);
  console.log('\n--- Calling Triage API ---\n');

  try {
    const response = await fetch('https://abbi-ai.com/api/email/triage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: testEmail })
    });

    const result = await response.json();

    console.log('Success:', result.success);
    console.log('Action:', result.action);
    console.log('\n--- Triage Result ---\n');
    console.log(JSON.stringify(result.triage, null, 2));

    if (result.triage && !result.triage.is_spam) {
      console.log('\n--- Dashboard Display Format ---\n');
      console.log(`### **Email: ${testEmail.subject}** ${result.triage.priority === 'HIGH' ? '⚠️ HIGH PRIORITY' : ''}`);
      console.log();
      console.log(`**From:** ${result.triage.from_name} (${result.triage.from_email})`);
      console.log(`**To:** ${result.triage.to_recipients.join(', ')}`);
      if (result.triage.cc_recipients && result.triage.cc_recipients.length > 0) {
        console.log(`**CC:** ${result.triage.cc_recipients.join(', ')}`);
      }
      console.log(`**Date:** ${testEmail.received_at}`);
      console.log(`**Folder:** ${testEmail.folder_name}`);
      console.log();
      console.log(`**Classification:** ${result.triage.classification}`);
      console.log();
      console.log(`**Summary:**`);
      console.log(result.triage.summary);
      console.log();
      if (result.triage.action_items && result.triage.action_items.length > 0) {
        console.log(`**Action Items:**`);
        result.triage.action_items.forEach(item => console.log(`- ${item}`));
        console.log();
      }
      if (result.triage.conversation_context) {
        console.log(`**Conversation Context:** ${result.triage.conversation_context}`);
        console.log();
      }
      console.log(`**Attachments:** ${result.triage.attachments.length > 0 ? result.triage.attachments.join(', ') : 'None'}`);
      console.log();
      console.log(`**Priority:** ${result.triage.priority}`);
      console.log(`**Tag:** ${result.triage.tag}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testTriage();
