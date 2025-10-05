// create-voucher-checkout.js
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Max-Age': '86400'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS OK' })
    };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Nur POST erlaubt' })
    };
  }
  
  try {
    const origin = event.headers.origin || event.headers.referer || '';
    const isTest = origin.includes('.webflow.io');
    
    const stripeKey = isTest ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_Prod;
    
    if (!stripeKey) {
      throw new Error('Stripe Key nicht gefunden');
    }
    
    const stripe = require('stripe')(stripeKey);
    const voucherData = JSON.parse(event.body || '{}');
    
    console.log('📦 Gutschein-Bestellung erhalten:');
    console.log('   Service:', voucherData.serviceName);
    console.log('   Preis:', voucherData.price);
    console.log('   Versandart:', voucherData.deliveryType);
    console.log('   Versandkosten:', voucherData.deliveryCost);
    
    // Validierung
    if (!voucherData.service || !voucherData.price || !voucherData.buyerEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unvollständige Gutschein-Daten' })
      };
    }
    
    // Bei physischem Gutschein muss Empfängeradresse vorhanden sein
    if (voucherData.deliveryType === 'physical' && !voucherData.recipient) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Empfängeradresse fehlt für physischen Gutschein' })
      };
    }
    
    // GUTSCHEIN-CODE GENERIEREN
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const voucherCode = `GS-${month}${day}${year}-${random}`;
    
    console.log(`🎫 Gutschein-Code generiert: ${voucherCode}`);
    
    // Stripe Line Items erstellen
    const lineItems = [{
      price_data: {
        currency: 'chf',
        product_data: {
          name: `🎁 Geschenkgutschein: ${voucherData.serviceName}`,
          description: `Gutschein-Code: ${voucherCode}${voucherData.deliveryType === 'physical' ? ' | Empfänger: ' + voucherData.recipient.name : ' | Digitaler Versand'}`,
          metadata: {
            type: 'voucher',
            voucher_code: voucherCode,
            service: voucherData.service,
            delivery_type: voucherData.deliveryType
          }
        },
        unit_amount: Math.round(voucherData.price * 100)
      },
      quantity: 1
    }];
    
    // Versandkosten NUR bei physischem Gutschein hinzufügen
    if (voucherData.deliveryType === 'physical' && voucherData.deliveryCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'chf',
          product_data: {
            name: '📦 Geschenkverpackung & Versand',
            metadata: { 
              type: 'shipping'
            }
          },
          unit_amount: Math.round(voucherData.deliveryCost * 100)
        },
        quantity: 1
      });
    }
    
    const totalAmount = voucherData.totalPrice || (voucherData.price + (voucherData.deliveryCost || 0));
    console.log(`💰 Gesamtbetrag: CHF ${totalAmount}`);
    
    // Checkout Session Configuration
    const sessionConfig = {
      payment_method_types: [
        'twint',
        'card',
        'paypal',
        'klarna'
      ],
      line_items: lineItems,
      mode: 'payment',
      client_reference_id: voucherCode,
      
      success_url: isTest 
        ? `https://aesthetikoase.webflow.io/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&voucher=${voucherCode}`
        : `https://xn--sthetikoase-k8a.ch/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&voucher=${voucherCode}`,
      cancel_url: isTest 
        ? `https://aesthetikoase.webflow.io/gutschein?cancelled=true`
        : `https://xn--sthetikoase-k8a.ch/gutschein?cancelled=true`,
      
      billing_address_collection: 'required',
      
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
      
      metadata: {
        type: 'voucher',
        voucher_code: voucherCode,
        service: voucherData.service,
        service_name: voucherData.serviceName,
        service_price: voucherData.price.toString(),
        delivery_type: voucherData.deliveryType,
        delivery_cost: (voucherData.deliveryCost || 0).toString(),
        total_price: totalAmount.toString(),
        buyer_email: voucherData.buyerEmail,
        greeting_text: voucherData.greetingText || '',
        environment: isTest ? 'test' : 'production',
        created_at: new Date().toISOString()
      }
    };
    
    // Lieferadresse NUR bei physischem Gutschein
    if (voucherData.deliveryType === 'physical') {
      sessionConfig.shipping_address_collection = {
        allowed_countries: ['CH', 'DE', 'AT']
      };
      
      // Empfängerdaten zu Metadata hinzufügen
      sessionConfig.metadata.recipient_name = voucherData.recipient.name;
      sessionConfig.metadata.recipient_street = voucherData.recipient.street;
      sessionConfig.metadata.recipient_zip = voucherData.recipient.zip;
      sessionConfig.metadata.recipient_city = voucherData.recipient.city;
    }
    
    // Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    console.log(`✅ Stripe Session erstellt: ${session.id}`);
    console.log(`🎫 Gutschein-Code: ${voucherCode}`);
    console.log(`📧 Versandart: ${voucherData.deliveryType}`);
    
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
