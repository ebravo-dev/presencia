/**
 * Test script for UAT Portal scraping
 * Run with: UAT_EMAIL=xxx UAT_PASSWORD=xxx npx tsx src/test-scraper.ts
 */
import 'dotenv/config';
import { scraperService } from './modules/scraper/scraper.service.js';

async function testScraper() {
    // Get credentials from environment variables
    const email = process.env.UAT_TEST_EMAIL;
    const password = process.env.UAT_TEST_PASSWORD;

    if (!email || !password) {
        console.error('❌ Please set UAT_TEST_EMAIL and UAT_TEST_PASSWORD environment variables');
        console.log('   Usage: UAT_TEST_EMAIL=xxx UAT_TEST_PASSWORD=xxx npx tsx src/test-scraper.ts');
        process.exit(1);
    }

    console.log('🧪 Testing UAT Scraper...\n');
    console.log(`📧 Email: ${email}`);
    console.log('🔑 Password: ********\n');

    try {
        console.log('🌐 Initializing browser...');
        await scraperService.init();

        console.log('🔐 Attempting login and scraping...\n');
        const result = await scraperService.scrapeGroups(email, password);

        if (result.success) {
            console.log('✅ Scraping successful!\n');
            console.log(`📚 Found ${result.groups.length} groups:\n`);

            result.groups.forEach((group, index) => {
                console.log(`  ${index + 1}. ${group.code}`);
                console.log(`     Name: ${group.name}`);
                console.log(`     Level: ${group.level}`);
                console.log(`     Classroom: ${group.classroom}`);
                console.log(`     Schedule: ${JSON.stringify(group.schedule)}`);
                console.log('');
            });
        } else {
            console.log('❌ Scraping failed!');
            console.log(`   Error: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        await scraperService.close();
        console.log('\n🏁 Test completed');
        process.exit(0);
    }
}

testScraper();
