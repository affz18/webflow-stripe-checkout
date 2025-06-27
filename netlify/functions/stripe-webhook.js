// netlify/functions/stripe-webhook.js

exports.handler = async (event, context) => {
  console.log('🔔 Webhook empfangen');

  // Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Nur POST erlaubt' })
    };
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_PROD || process.env.STRIPE_SECRET_KEY);
    
    // Webhook Secret für Verifizierung
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let webhookEvent;
    
    if (endpointSecret) {
      // Webhook Signatur verifizieren
      const sig = event.headers['stripe-signature'];
      
      try {
        webhookEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
        console.log('✅ Webhook Signatur verifiziert');
      } catch (err) {
        console.log(`❌ Webhook Signatur Fehler: ${err.message}`);
        return {
          statusCode: 400,
          body: `Webhook Error: ${err.message}`
        };
      }
    } else {
      // Für Tests ohne Signatur
      webhookEvent = JSON.parse(event.body);
      console.log('⚠️ Webhook ohne Signatur-Verifizierung');
    }

    // Event Type prüfen
    const eventType = webhookEvent.type;
    console.log(`📧 Event Type: ${eventType}`);

    // Auf erfolgreiche Zahlung reagieren
    if (eventType === 'checkout.session.completed') {
      const session = webhookEvent.data.object;
      
      console.log('💰 Zahlung erfolgreich!');
      console.log(`🔢 Bestellnummer: ${session.client_reference_id}`);
      console.log(`👤 Kunde: ${session.customer_details?.name}`);
      console.log(`📧 E-Mail: ${session.customer_details?.email}`);
      console.log(`💶 Betrag: ${session.amount_total/100} ${session.currency.toUpperCase()}`);
      
      // HIER: Deine Aktionen ausführen
      await handleSuccessfulPayment(session);
    }

    // Stripe bestätigen, dass Webhook empfangen wurde
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };

  } catch (error) {
    console.error('❌ Webhook Fehler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Funktion für erfolgreiche Zahlung
async function handleSuccessfulPayment(session) {
  const orderNumber = session.client_reference_id;
  const customerName = session.customer_details?.name || 'Unbekannt';
  const customerEmail = session.customer_details?.email;
  const amount = session.amount_total / 100;
  const currency = session.currency.toUpperCase();
  
  console.log(`🎉 Neue Bestellung: ${orderNumber}`);
  
  // 1. E-Mail senden (z.B. mit SendGrid, Mailgun, etc.)
  try {
    await sendOrderConfirmationEmail({
      orderNumber,
      customerName,
      customerEmail,
      amount,
      currency
    });
    console.log('✅ Bestätigungs-E-Mail gesendet');
  } catch (emailError) {
    console.error('❌ E-Mail Fehler:', emailError);
  }
  
  // 2. Kunde zu Mailchimp hinzufügen (optional)
  try {
    await addToMailchimp(customerEmail, customerName, orderNumber);
    console.log('✅ Kunde zu Mailchimp hinzugefügt');
  } catch (mailchimpError) {
    console.error('❌ Mailchimp Fehler:', mailchimpError);
  }
  
  // 3. Interne Benachrichtigung (z.B. Slack, E-Mail an dich)
  try {
    await notifyOwner(orderNumber, customerName, amount, currency);
    console.log('✅ Owner benachrichtigt');
  } catch (notifyError) {
    console.error('❌ Benachrichtigung Fehler:', notifyError);
  }
}

// E-Mail senden (Beispiel mit fetch zu anderem Service)
async function sendOrderConfirmationEmail({ orderNumber, customerName, customerEmail, amount, currency }) {
  // Hier könntest du SendGrid, Mailgun oder anderen E-Mail-Service nutzen
  console.log(`📧 E-Mail würde gesendet an: ${customerEmail}`);
  console.log(`Betreff: Bestellbestätigung #${orderNumber}`);
  console.log(`Inhalt: Hallo ${customerName}, vielen Dank für Ihre Bestellung #${orderNumber} über ${amount} ${currency}`);
  
  // Beispiel: SendGrid API Call
  // const response = await fetch('https://api.sendgrid.com/v3/mail/send', { ... });
}

// Mailchimp Integration
async function addToMailchimp(email, name, orderNumber) {
  console.log(`📋 Mailchimp: ${email} hinzufügen`);
  // Mailchimp API Call hier
}

// Owner Benachrichtigung
async function notifyOwner(orderNumber, customerName, amount, currency) {
  console.log(`🔔 NEUE BESTELLUNG: #${orderNumber} von ${customerName} - ${amount} ${currency}`);
  // E-Mail an dich oder Slack-Nachricht
}
