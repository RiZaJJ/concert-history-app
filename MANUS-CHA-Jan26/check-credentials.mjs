import 'dotenv/config';

console.log('\n=== Google Drive Credentials Diagnostic ===\n');

const creds = process.env.GOOGLE_DRIVE_CREDENTIALS;

if (!creds) {
  console.log('❌ GOOGLE_DRIVE_CREDENTIALS is not set');
  process.exit(1);
}

console.log('✓ GOOGLE_DRIVE_CREDENTIALS is set');
console.log(`Length: ${creds.length} characters`);
console.log(`First 50 chars: ${creds.substring(0, 50)}...`);
console.log(`Last 50 chars: ...${creds.substring(creds.length - 50)}`);

console.log('\nAttempting to parse as JSON...');
try {
  const parsed = JSON.parse(creds);
  console.log('✓ Successfully parsed as JSON');
  console.log('\nJSON structure:');
  console.log(`  - type: ${parsed.type || 'missing'}`);
  console.log(`  - project_id: ${parsed.project_id || 'missing'}`);
  console.log(`  - private_key_id: ${parsed.private_key_id ? 'present' : 'missing'}`);
  console.log(`  - private_key: ${parsed.private_key ? 'present (' + parsed.private_key.length + ' chars)' : 'missing'}`);
  console.log(`  - client_email: ${parsed.client_email || 'missing'}`);
  console.log(`  - client_id: ${parsed.client_id || 'missing'}`);
  
  if (parsed.type === 'service_account') {
    console.log('\n✓ This appears to be a valid service account JSON');
    console.log(`\nService account email: ${parsed.client_email}`);
    console.log('\n⚠️  Make sure you have shared your Google Drive folder with this email!');
  } else {
    console.log(`\n⚠️  Unexpected type: ${parsed.type}`);
  }
} catch (error) {
  console.log('❌ Failed to parse as JSON');
  console.log(`Error: ${error.message}`);
  console.log('\nThe credentials must be valid JSON. Common issues:');
  console.log('  - Extra text before or after the JSON');
  console.log('  - Escaped quotes that should not be escaped');
  console.log('  - Missing quotes around strings');
  console.log('  - Newlines not properly handled');
  console.log('\nExpected format: {"type":"service_account",...}');
}

console.log('\n=== End Diagnostic ===\n');
