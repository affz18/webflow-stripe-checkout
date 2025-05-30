const stripe = require('stripe')(getStripeKey());

function getStripeKey(event) {
  // Prüfe anhand der Origin welche Keys verwendet werden sollen
  const origin = event.headers.origin || event.headers.referer || '';
  const isTestEnvironment = origin.includes('.webflow.io') || 
                           origin.includes('staging') ||
                           process.env.CONTEXT === 'deploy-preview';
  
  console.log('Origin:', origin);
  
  if (isTestEnvironment) {
    console.log('🧪 Using TEST Stripe Key (from webflow.io)');
    return process.env.STRIPE_SECRET_KEY; // Test Key
  } else {
    console.log('🟢 Using PRODUCTION Stripe Key');
    return process.env.STRIPE_Prod; // Live Key
  }
}

exports.handler = async (event, context) => {
  console.log('Checkout Function aufgerufen');
  console.log('Origin:', event.headers.origin);
  console.log('Referer:', event.headers.referer);
  
  // WICHTIG: Stripe Key erst hier initialisieren wenn wir den event haben
  const stripe = require('stripe')(getStripeKey(event));
  
  // CORS Headers
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

    console.log('Items erhalten:', items);

    // Stripe Line Items formatieren
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'chf',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
          metadata: {
            product_type: 'webflow_product',
            source: 'webflow_checkout'
          }
        },
        unit_amount: Math.round(item.price * 100), // Preis in Rappen (Cent)
      },
      quantity: item.quantity,
    }));

    // Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'twint'], // Karten + Twint
      line_items: lineItems,
      mode: 'payment',
      success_url: `${event.headers.origin}/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${event.headers.origin}/checkout`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT'],
      },
      billing_address_collection: 'required',
      // Wichtig: Bestelldetails in Session Metadata speichern
      metadata: {
        order_source: 'webflow_custom_checkout',
        environment: process.env.CONTEXT || 'unknown',
        products: JSON.stringify(items.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity
        }))),
        total_items: items.length,
        customer_email: 'will_be_filled_by_stripe'
      }
    });

    console.log('Stripe Session erstellt:', session.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
        session_id: session.id,
        environment: process.env.CONTEXT
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
