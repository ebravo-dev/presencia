/**
 * Test script for UAT Portal student scraping
 * Run with: npx tsx src/test-scraper-students.ts
 */
import 'dotenv/config';
import { scraperService } from './modules/scraper/scraper.service.js';

async function testStudentScraper() {
    // Get credentials from environment variables
    const email = process.env.UAT_TEST_EMAIL;
    const password = process.env.UAT_TEST_PASSWORD;

    if (!email || !password) {
        console.error('❌ Please set UAT_TEST_EMAIL and UAT_TEST_PASSWORD environment variables');
        process.exit(1);
    }

    console.log('🧪 Testing UAT Student Scraper...\n');
    console.log(`📧 Email: ${email}`);
    console.log('🔑 Password: ********\n');

    // First, get the groups to find a valid group code
    console.log('📚 First, fetching groups to get a valid group code...\n');

    try {
        console.log('🌐 Initializing browser...');
        await scraperService.init();

        // Get groups first
        console.log('🔐 Fetching groups...\n');
        const groupsResult = await scraperService.scrapeGroups(email, password);

        if (!groupsResult.success || groupsResult.groups.length === 0) {
            console.error('❌ Failed to fetch groups');
            console.error(`   Error: ${groupsResult.error || 'No groups found'}`);
            await scraperService.close();
            process.exit(1);
        }

        // Use the first group for testing
        const testGroup = groupsResult.groups[0];
        console.log(`\n✅ Found ${groupsResult.groups.length} groups`);
        console.log(`📋 Using first group for student test: ${testGroup.code}`);
        console.log(`   Name: ${testGroup.name}\n`);

        // Now scrape students for that group
        console.log('👥 Scraping students for this group...\n');
        const studentsResult = await scraperService.scrapeStudents(email, password, testGroup.code);

        if (studentsResult.success) {
            console.log('✅ Student scraping successful!\n');
            console.log(`📚 Found ${studentsResult.students.length} students:\n`);

            studentsResult.students.forEach((student, index) => {
                console.log(`  ${index + 1}. ${student.matricula}`);
                console.log(`     Name: ${student.name}`);
                console.log('');
            });

            if (studentsResult.students.length === 0) {
                console.log('⚠️ No students extracted. Check the debug screenshots for more info.');
                console.log('   Screenshots saved to: ./debug-screenshots/');
            }
        } else {
            console.log('❌ Student scraping failed!');
            console.log(`   Error: ${studentsResult.error}`);
            console.log('   Check debug screenshots in ./debug-screenshots/');
        }
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        await scraperService.close();
        console.log('\n🏁 Test completed');
        process.exit(0);
    }
}

testStudentScraper();
