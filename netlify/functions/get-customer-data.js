// Neue Datei: netlify/functions/get-customer-data.js

exports.handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Nur POST erlaubt' })
    };
  }

  try {
    const { session_id } = JSON.parse(event.body);
    
    if (!session_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Session ID fehlt' })
      };
    }

    // Stripe initialisieren
    const origin = event.headers.origin || event.headers.referer || '';
    const isTest = origin.includes('.webflow.io');
    const stripeKey = isTest ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_Prod;
    
    if (!stripeKey) {
      throw new Error('Stripe Key nicht gefunden');
    }

    const stripe = require('stripe')(stripeKey);

    // Checkout Session abrufen
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    // Antwort mit Kundendaten
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        customer_details: session.customer_details,
        client_reference_id: session.client_reference_id,
        amount_total: session.amount_total,
        currency: session.currency
      })
    };

  } catch (error) {
    console.error('Fehler beim Abrufen der Kundendaten:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Fehler beim Laden der Kundendaten',
        details: error.message 
      })
    };
  }
};
