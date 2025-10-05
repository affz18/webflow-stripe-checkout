// create-voucher-checkout.js
exports.handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Max-Age': '86400'
  };
  
  // OPTIONS Request für CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS OK' })
    };
  }
  
  // Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Nur POST erlaubt' })
    };
  }
  
  try {
    // Stripe Key auswählen basierend auf Origin
    const origin = event.headers.origin || event.headers.referer || '';
    const isTest = origin.includes('.webflow.io');
    
    const stripeKey = isTest ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_Prod;
    
    if (!stripeKey) {
      throw new Error('Stripe Key nicht gefunden');
    }
    
    // Stripe initialisieren
    const stripe = require('stripe')(stripeKey);
    
    // Request Body parsen
    const voucherData = JSON.parse(event.body || '{}');
    
    console.log('📦 Gutschein-Bestellung erhalten:');
    console.log('   Service:', voucherData.serviceName);
    console.log('   Preis:', voucherData.price);
    console.log('   Empfänger:', voucherData.recipient.name);
    
    // Validierung
    if (!voucherData.service || !voucherData.price || !voucherData.recipient) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unvollständige Gutschein-Daten' })
      };
    }
    
    // GUTSCHEIN-CODE GENERIEREN
    // Format: GS-MMDDYYYY-XXXX (GS = GeschenkSchenk, dann Datum, dann 4-stelliger Zufallscode)
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const voucherCode = `GS-${month}${day}${year}-${random}`;
    
    console.log(`🎫 Gutschein-Code generiert: ${voucherCode}`);
    
    // Stripe Line Item erstellen
    const lineItems = [{
      price_data: {
        currency: 'chf',
        product_data: {
          name: `🎁 Geschenkgutschein: ${voucherData.serviceName}`,
          description: `Gutschein-Code: ${voucherCode} | Empfänger: ${voucherData.recipient.name}`,
          metadata: {
            type: 'voucher',
            voucher_code: voucherCode,
            service: voucherData.service,
            recipient_name: voucherData.recipient.name
          }
        },
        unit_amount: Math.round(voucherData.price * 100) // CHF zu Rappen
      },
      quantity: 1
    }];
    
    // Versandkosten für physische Geschenkbox (optional anpassen)
    const shippingCost = 0.1;
    lineItems.push({
      price_data: {
        currency: 'chf',
        product_data: {
          name: '📦 Geschenkbox Versand',
          metadata: { 
            type: 'shipping'
          }
        },
        unit_amount: Math.round(shippingCost * 100)
      },
      quantity: 1
    });
    
    const totalAmount = voucherData.price + shippingCost;
    console.log(`💰 Gesamtbetrag: CHF ${totalAmount}`);
    
    // Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'twint',
        'card',
        'paypal',
        'klarna'
      ],
      line_items: lineItems,
      mode: 'payment',
      client_reference_id: voucherCode,
      
      // Success & Cancel URLs
      success_url: isTest 
        ? `https://aesthetikoase.webflow.io/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&voucher=${voucherCode}`
        : `https://xn--sthetikoase-k8a.ch/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&voucher=${voucherCode}`,
      cancel_url: isTest 
        ? `https://aesthetikoase.webflow.io/gutschein?cancelled=true`
        : `https://xn--sthetikoase-k8a.ch/gutschein?cancelled=true`,
      
      billing_address_collection: 'required',
      
      // Lieferadresse = Empfängeradresse
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT']
      },
      
      // Session läuft nach 30 Minuten ab
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
      
      // Metadaten für Zapier/Webhooks
      metadata: {
        type: 'voucher',
        voucher_code: voucherCode,
        service: voucherData.service,
        service_name: voucherData.serviceName,
        service_price: voucherData.price.toString(),
        recipient_name: voucherData.recipient.name,
        recipient_street: voucherData.recipient.street,
        recipient_zip: voucherData.recipient.zip,
        recipient_city: voucherData.recipient.city,
        buyer_email: voucherData.buyerEmail,
        greeting_text: voucherData.greetingText || '',
        environment: isTest ? 'test' : 'production',
        created_at: new Date().toISOString()
      }
    });
    
    console.log(`✅ Stripe Session erstellt: ${session.id}`);
    console.log(`🎫 Gutschein-Code: ${voucherCode}`);
    
    // Rückgabe
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
        session_id: session.id,
        voucher_code: voucherCode
      })
    };
    
  } catch (error) {
    console.error('❌ Gutschein Checkout Fehler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server Fehler beim Erstellen des Gutscheins',
        details: error.message 
      })
    };
  }
};
