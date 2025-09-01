#!/usr/bin/env node
// This script helps you create the proper Stripe products and prices
// Run this with: node scripts/setup-stripe-products.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  try {
    console.log('🚀 Creating Stripe products for ResellAIO...\n');

    // Check if we have a Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ Error: STRIPE_SECRET_KEY environment variable is not set');
      console.log('\n💡 Please set your Stripe secret key:');
      console.log('   export STRIPE_SECRET_KEY=sk_test_your_actual_test_key_here');
      console.log('\n   Get your key from: https://dashboard.stripe.com/test/apikeys');
      process.exit(1);
    }

    // Check if the key looks valid
    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      console.error('❌ Error: Invalid Stripe secret key format');
      console.log('   Your key should start with "sk_test_" for test mode or "sk_live_" for live mode');
      process.exit(1);
    }

    // Create the Pro Monthly product
    console.log('📦 Creating Pro Monthly product...');
    const proProduct = await stripe.products.create({
      name: 'ResellAIO Pro Monthly',
      description: 'Best for serious resellers - unlimited inventory, advanced analytics, and more',
      metadata: {
        plan_id: 'pro_monthly',
        app: 'resell_aio'
      }
    });

    console.log('✅ Created Pro Product:', proProduct.id);

    // Create the price for Pro Monthly
    console.log('💰 Creating price for Pro Monthly...');
    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 2900, // $29.00 in cents
      currency: 'usd',
      recurring: {
        interval: 'month'
      },
      metadata: {
        plan_id: 'pro_monthly',
        app: 'resell_aio'
      }
    });

    console.log('✅ Created Pro Price:', proPrice.id);

    // Also create a yearly option (optional)
    console.log('💰 Creating yearly price option...');
    const proYearlyPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 29000, // $290.00 in cents (save $58/year)
      currency: 'usd',
      recurring: {
        interval: 'year'
      },
      metadata: {
        plan_id: 'pro_yearly',
        app: 'resell_aio'
      }
    });

    console.log('✅ Created Pro Yearly Price:', proYearlyPrice.id);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 SUCCESS! Your Stripe products are ready.');
    console.log('='.repeat(60));
    console.log('\n📋 NEXT STEPS:');
    console.log('\n1. 🔧 Update your database with the price ID:');
    console.log(`   In your SQL migration file, replace this line:`);
    console.log(`   SET stripe_price_id = 'price_REPLACE_WITH_YOUR_ACTUAL_STRIPE_PRICE_ID'`);
    console.log(`   With:`);
    console.log(`   SET stripe_price_id = '${proPrice.id}'`);
    
    console.log('\n2. 🏃‍♂️ Run the database migration:');
    console.log('   supabase db push');
    
    console.log('\n3. 🔗 Set up webhook endpoint in Stripe Dashboard:');
    console.log('   • Go to: https://dashboard.stripe.com/test/webhooks');
    console.log('   • Click "Add endpoint"');
    console.log('   • URL: https://tofckkpzdbcplxkgxcsr.supabase.co/functions/v1/stripe-webhook');
    console.log('   • Events to select:');
    console.log('     - checkout.session.completed');
    console.log('     - customer.subscription.created');
    console.log('     - customer.subscription.updated');
    console.log('     - customer.subscription.deleted');
    console.log('     - invoice.payment_succeeded');
    console.log('     - invoice.payment_failed');

    console.log('\n4. 🔑 Copy webhook signing secret to Supabase:');
    console.log('   After creating the webhook, copy the signing secret and add it to');
    console.log('   your Supabase project under Settings → Edge Functions');
    console.log('   Variable name: STRIPE_WEBHOOK_SECRET');

    console.log('\n5. 🧪 Test with these test card numbers:');
    console.log('   • Success: 4242 4242 4242 4242');
    console.log('   • Decline: 4000 0000 0000 0002');
    console.log('   • Insufficient funds: 4000 0000 0000 9995');
    console.log('   (Use any future expiry, any CVC, any postal code)');

    console.log('\n📝 Created Products Summary:');
    console.log(`   Product ID: ${proProduct.id}`);
    console.log(`   Monthly Price ID: ${proPrice.id}`);
    console.log(`   Yearly Price ID: ${proYearlyPrice.id}`);

    console.log('\n🎯 Quick Copy-Paste SQL Command:');
    console.log(`UPDATE public.subscription_plans SET stripe_price_id = '${proPrice.id}' WHERE id = 'pro_monthly';`);

  } catch (error) {
    console.error('❌ Error creating products:', error.message);
    
    if (error.code === 'authentication_required') {
      console.log('\n💡 This usually means your API key is invalid or not set correctly.');
      console.log('   Make sure you\'re using your SECRET key (starts with sk_), not your publishable key.');
    }
    
    if (error.code === 'rate_limit') {
      console.log('\n💡 Rate limit hit. Wait a moment and try again.');
    }
    
    process.exit(1);
  }
}

// Check if this script is being run directly
if (require.main === module) {
  createProducts();
}

module.exports = { createProducts };

