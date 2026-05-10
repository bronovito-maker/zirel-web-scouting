import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBookingReliably,
  extractCleanEmails,
  classifyCategoryFit,
  classifyLeadForZirel
} from '../dist/core.js';

test('Pensione Ardenza booking above fold detected', () => {
  const html = `
  <header><nav><a href="/booking/room">Prenota</a></nav></header>
  <main><h1>Pensione Ardenza</h1></main>`;
  const out = detectBookingReliably(html.toLowerCase(), ['https://www.pensioneardenza.com/booking/room'], 'https://www.pensioneardenza.com');
  assert.equal(out.hasBooking, true);
  assert.equal(out.bookingVisibility, 'above_fold');
});

test('Hotel Navy hub/subflow booking detected as subflow or above/below', () => {
  const html = `
  <a href="https://piccolonavy.hotelnavy.com/">Piccolo Navy</a>
  <a href="https://hotel.hotelnavy.com/booking">Hotel Navy Booking</a>`;
  const out = detectBookingReliably(
    html.toLowerCase(),
    ['https://piccolonavy.hotelnavy.com/','https://hotel.hotelnavy.com/booking'],
    'http://www.hotelnavy.it/'
  );
  assert.equal(out.hasBooking, true);
  assert.ok(['subflow','above_fold','below_fold','hidden'].includes(out.bookingVisibility));
});

test('Email asset false are filtered out', () => {
  const html = `dieci-anni@2x.png red-orizz_l2a6621-780x540@2x.jpg info@hotel.it`;
  const out = extractCleanEmails(html.toLowerCase(), []);
  assert.equal(out.email, 'info@hotel.it');
  assert.equal(out.validEmails.includes('dieci-anni@2x.png'), false);
  assert.equal(out.validEmails.includes('red-orizz_l2a6621-780x540@2x.jpg'), false);
});

test('Small single-site no-booking no-whatsapp no-chatbot with reviews>=80 can be SUPER_HOT', () => {
  const out = classifyLeadForZirel({
    inCity: true,
    hasWebsite: true,
    hasWhatsapp: false,
    hasBooking: false,
    bookingVisibility: 'none',
    hasIndirectBooking: false,
    siteStructureType: 'single_site',
    funnelComplexity: 'simple',
    hasFlowBooking: false,
    hasChatbot: false,
    hasContactForm: false,
    onlyLandline: true,
    reviews: 100,
    keyword: 'hotel',
    businessSize: 'small',
    businessRelevance: 'core',
    categoryFit: 'core',
    evidenceLevel: 'high'
  });
  assert.equal(out.callPriority, 'SUPER_HOT');
});

test('Arena/event space should be borderline category fit', () => {
  const fit = classifyCategoryFit('Arena Alfieri', ['event_venue'], 'hotel');
  assert.equal(fit, 'borderline');
});

test('Mobile present scenario should not rely on only-landline logic for priority', () => {
  const out = classifyLeadForZirel({
    inCity: true,
    hasWebsite: true,
    hasWhatsapp: false,
    hasBooking: false,
    bookingVisibility: 'none',
    hasIndirectBooking: false,
    siteStructureType: 'single_site',
    funnelComplexity: 'simple',
    hasFlowBooking: false,
    hasChatbot: false,
    hasContactForm: false,
    onlyLandline: false,
    reviews: 120,
    keyword: 'hotel',
    businessSize: 'small',
    businessRelevance: 'core',
    categoryFit: 'core',
    evidenceLevel: 'high'
  });
  assert.notEqual(out.callPriority, 'SUPER_HOT');
});
