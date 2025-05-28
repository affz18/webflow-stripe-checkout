const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // CORS Headers für alle Requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  // OPTIONS Request für CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS Preflight successful' })
    };
  }

  // Nur POST Requests erlauben
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Warenkorb-Daten aus Request Body holen
    const { items } = JSON.parse(event.body);
    
    // Validierung
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keine Artikel im Warenkorb' })
      };
    }

    // Stripe Line Items formatieren
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'chf',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100), // Preis in Rappen (Cent)
      },
      quantity: item.quantity,
    }));

    // Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Erstmal nur Karten
      line_items: lineItems,
      mode: 'payment',
      success_url: `${event.headers.origin}/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${event.headers.origin}/checkout`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT'], // Deine Lieferländer
      },
      billing_address_collection: 'required',
      // Apple Pay und Google Pay werden automatisch angezeigt wenn verfügbar
      automatic_payment_methods: {
        enabled: true, // Das aktiviert Apple Pay, Google Pay automatisch
      },
      // Automatische Steuerberechnung (optional)
      automatic_tax: {
        enabled: false, // Auf true setzen wenn du Stripe Tax nutzt
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
        session_id: session.id
      })
    };

  } catch (error) {
    console.error('Stripe Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Fehler beim Erstellen der Checkout-Session',
        details: error.message 
      })
    };
  }
};
