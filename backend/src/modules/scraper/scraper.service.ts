import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { UAT_SELECTORS, UAT_URLS } from './uat-selectors.js';
import { env } from '../../core/config/env.js';

export interface ScrapedGroup {
    code: string;
    name: string;
    level: string;
    classroom: string;
    schedule: {
        lunes?: string;
        martes?: string;
        miercoles?: string;
        jueves?: string;
        viernes?: string;
        sabado?: string;
        domingo?: string;
    };
}

export interface ScrapedStudent {
    matricula: string;
    name: string;
}

export interface ScrapeResult {
    success: boolean;
    groups: ScrapedGroup[];
    error?: string;
}

/**
 * UAT Portal Scraper Service
 * Handles login and data extraction from the university portal
 */
export class ScraperService {
    private browser: Browser | null = null;

    /**
     * Initialize the browser instance
     */
    async init(): Promise<void> {
        if (this.browser) return;

        console.log(`🌐 Initializing browser with Playwright's bundled Chromium`);

        this.browser = await chromium.launch({
            headless: true,
            // No executablePath - use Playwright's bundled Chromium
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                // Disable crash reporter to avoid crashpad_handler issues in Docker
                '--disable-crash-reporter',
                '--disable-crash-uploads',
                '--disable-features=VizDisplayCompositor',
                // Additional stability flags for containerized environments
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
            ],
        });

        console.log('🌐 Browser initialized');
    }

    /**
     * Close the browser instance
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('🌐 Browser closed');
        }
    }

    /**
     * Scrape groups/classes for a professor
     * @param email - Professor's institutional email
     * @param password - Decrypted password (will be cleared from memory after use)
     */
    async scrapeGroups(email: string, password: string): Promise<ScrapeResult> {
        if (!this.browser) {
            await this.init();
        }

        const context = await this.browser!.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });

        const page = await context.newPage();

        try {
            // Step 1: Login
            console.log(`🔐 Logging in as ${email}...`);
            await this.login(page, email, password);

            // Step 2: Navigate to horarios
            console.log('📋 Navigating to horarios...');
            await this.navigateToHorarios(page);

            // Step 3: Extract groups
            console.log('📊 Extracting groups...');
            const groups = await this.extractGroups(page);

            console.log(`✅ Scraped ${groups.length} groups`);

            return {
                success: true,
                groups,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Scraping failed:', errorMessage);

            return {
                success: false,
                groups: [],
                error: errorMessage,
            };
        } finally {
            // Always close context to free resources
            await context.close();

            // Clear password from memory (though JavaScript doesn't guarantee this)
            // The variable will be garbage collected
        }
    }

    /**
     * Login to UAT portal
     * The portal uses DevExpress (dx) components
     */
    private async login(page: Page, email: string, password: string): Promise<void> {
        // Navigate to login page
        await page.goto(UAT_URLS.LOGIN, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for DevExpress form to initialize
        await page.waitForSelector(UAT_SELECTORS.LOGIN.EMAIL_INPUT, { timeout: 30000 });

        // Small delay to ensure DevExpress components are ready
        await page.waitForTimeout(1000);

        // Fill credentials - DevExpress inputs
        console.log('📝 Filling credentials...');
        await page.fill(UAT_SELECTORS.LOGIN.EMAIL_INPUT, email);
        await page.fill(UAT_SELECTORS.LOGIN.PASSWORD_INPUT, password);

        // Check privacy checkbox (required by UAT portal)
        // IMPORTANT: Click directly on the checkbox ICON, not the text label
        // Clicking the text opens an unnecessary privacy popup dialog
        console.log('☑️ Accepting privacy terms...');
        const checkbox = await page.$(UAT_SELECTORS.LOGIN.PRIVACY_CHECKBOX);
        if (checkbox) {
            await checkbox.click();
            await page.waitForTimeout(500); // Brief wait for checkbox state to update
        }

        // Submit login
        console.log('🔘 Clicking login button...');
        await page.click(UAT_SELECTORS.LOGIN.SUBMIT_BUTTON, { force: true });

        // Wait for the portal to load after login
        // The UAT portal stays on the same URL but loads the menu dynamically
        console.log('⏳ Waiting for portal to load after login...');
        await page.waitForTimeout(5000); // Give time for JavaScript to execute

        // Check if we got an error message or if the menu loaded
        const errorElement = await page.$(UAT_SELECTORS.LOGIN.ERROR_MESSAGE);
        if (errorElement) {
            const errorText = await errorElement.textContent();
            if (errorText && errorText.includes('Usuario') || errorText?.includes('contraseña')) {
                throw new Error(`Login failed: ${errorText}`);
            }
        }

        // Wait for the menu to be visible (sign of successful login)
        try {
            await page.waitForSelector('#treeViewMenuPrincipal', { timeout: 10000 });
            console.log('🔓 Login successful - menu detected');
        } catch {
            // Menu might not be available yet, try to check if login form is gone
            const loginForm = await page.$(UAT_SELECTORS.LOGIN.SUBMIT_BUTTON);
            if (loginForm) {
                // Still on login page - login failed
                await page.screenshot({ path: './debug-screenshots/login-failed.png' });
                throw new Error('Login failed - still on login page');
            }
            console.log('🔓 Login appears successful (login form gone)');
        }

        console.log('📍 Current URL:', page.url());
    }

    /**
     * Navigate to horarios/schedule page via the DevExpress TreeView menu
     * The menu loads dynamically via JavaScript after login
     */
    private async navigateToHorarios(page: Page): Promise<void> {
        const debugDir = './debug-screenshots';
        const fs = await import('fs');
        await fs.promises.mkdir(debugDir, { recursive: true });

        console.log('📍 Current URL:', page.url());

        // Wait for the TreeView menu to have items loaded
        console.log('⏳ Waiting for menu to load...');
        try {
            await page.waitForSelector('#treeViewMenuPrincipal .dx-treeview-item', { timeout: 15000 });
            console.log('✅ Menu items loaded');
        } catch {
            // Save debug info if menu doesn't load
            await page.screenshot({ path: `${debugDir}/no-menu.png` });
            const html = await page.content();
            await fs.promises.writeFile(`${debugDir}/no-menu.html`, html);
            console.log('⚠️ Menu items not found, saved debug files');
        }

        // Take screenshot of menu loaded state
        await page.screenshot({ path: `${debugDir}/menu-loaded.png` });
        console.log(`📸 Screenshot saved to ${debugDir}/menu-loaded.png`);

        // Save HTML for debugging - useful to understand menu structure
        const html = await page.content();
        await fs.promises.writeFile(`${debugDir}/menu-loaded.html`, html);

        // Log all menu items found for debugging
        const menuItems = await page.$$eval('#treeViewMenuPrincipal .dx-treeview-item', items =>
            items.map(item => item.textContent?.trim() || '')
        );
        console.log('📋 Menu items found:', menuItems);

        // First, expand the root menu item (it's collapsed by default)
        console.log('🔍 Expanding root menu item...');
        const toggleButton = await page.$('#treeViewMenuPrincipal .dx-treeview-toggle-item-visibility');
        if (toggleButton) {
            console.log('🔘 Found toggle button, clicking to expand...');
            await toggleButton.click();
            await page.waitForTimeout(2000);

            // Check what items are now visible after expanding
            const expandedItems = await page.$$eval('#treeViewMenuPrincipal .dx-treeview-item', items =>
                items.map(item => item.textContent?.trim() || '')
            );
            console.log('📋 Menu items after expanding:', expandedItems);
        }

        // Take screenshot after expanding root
        await page.screenshot({ path: `${debugDir}/menu-expanded.png` });

        // Now look for "Profesor" menu item and expand it
        console.log('🔍 Looking for Profesor menu item...');
        const profesorItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Profesor")');
        if (profesorItem) {
            console.log('🔘 Found Profesor, clicking to expand...');
            await profesorItem.click();
            await page.waitForTimeout(2000);

            // After expanding Profesor, check what items are now visible
            const profesorExpandedItems = await page.$$eval('#treeViewMenuPrincipal .dx-treeview-item', items =>
                items.map(item => item.textContent?.trim() || '')
            );
            console.log('📋 Menu items after expanding Profesor:', profesorExpandedItems);

            // Take screenshot after expanding Profesor
            await page.screenshot({ path: `${debugDir}/profesor-expanded.png` });
        } else {
            console.log('⚠️ Profesor not found in menu');
        }

        // Look for "Consultas" in the TreeView and click it to expand
        console.log('🔍 Looking for Consultas in TreeView...');
        const consultasItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Consultas")');
        if (consultasItem) {
            console.log('🔘 Found Consultas, clicking to expand...');
            await consultasItem.click();
            await page.waitForTimeout(2000);

            // After expanding, take another screenshot
            await page.screenshot({ path: `${debugDir}/consultas-expanded.png` });
        } else {
            console.log('⚠️ Consultas not found in menu');
        }

        // Now look for "Horarios" in the expanded submenu
        console.log('🔍 Looking for Horarios...');
        const horariosItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Horarios")');
        if (horariosItem) {
            console.log('🔘 Found Horarios, clicking...');
            await horariosItem.click();
            await page.waitForTimeout(3000);
        } else {
            // Try clicking on any link with Horarios text
            const horariosLink = await page.$('a:has-text("Horarios")');
            if (horariosLink) {
                console.log('🔘 Found Horarios link, clicking...');
                await horariosLink.click();
                await page.waitForTimeout(3000);
            } else {
                console.log('⚠️ Horarios not found in menu');
            }
        }

        // Take screenshot after navigation
        await page.screenshot({ path: `${debugDir}/consultas-page.png` });
        console.log(`📸 Screenshot saved to ${debugDir}/consultas-page.png`);
        console.log('📍 Final URL:', page.url());

        // Now fill the filter form to load horarios data
        console.log('📝 Filling filter form...');
        await this.fillHorariosFilters(page, debugDir);

        // Save final HTML for debugging
        const fs2 = await import('fs');
        const finalHtml = await page.content();
        await fs2.promises.writeFile(`${debugDir}/horarios-page.html`, finalHtml);
    }

    /**
     * Fill the filter form on the Consultas page to load horarios data
     * Selects: Nivel=Licenciatura, Campus=Tampico, DES=Ingeniería, Ciclo=2025-3 Otoño
     */
    private async fillHorariosFilters(page: Page, debugDir: string): Promise<void> {
        // Wait for the filter form to be ready
        console.log('⏳ Waiting for filter form to load...');
        await page.waitForTimeout(3000);

        // The UAT portal uses DevExpress SelectBox components
        // We need to click to open and then select from the dropdown list

        // Step 1: Select "LICENCIATURA" in Nivel educativo (#ucNivel)
        console.log('1️⃣ Selecting Nivel educativo: LICENCIATURA...');
        await this.selectDevExpressDropdown(page, '#ucNivel', 'LICENCIATURA');
        await page.waitForTimeout(2000); // Wait for Campus to load via AJAX

        // Step 2: Select "TAMPICO" in Campus (#ucCU)
        console.log('2️⃣ Selecting Campus: TAMPICO...');
        await this.selectDevExpressDropdown(page, '#ucCU', 'TAMPICO');
        await page.waitForTimeout(2000); // Wait for DES to load via AJAX

        // Step 3: Select "INGENIERIA" in Dependencia académica (#ucDes)
        console.log('3️⃣ Selecting Dependencia: INGENIERIA...');
        await this.selectDevExpressDropdown(page, '#ucDes', 'INGENIERIA');
        await page.waitForTimeout(2000); // Wait for Ciclo to load via AJAX

        // Step 4: Select Ciclo escolar - the portal defaults to active period, but we'll select explicitly
        console.log('4️⃣ Selecting Ciclo escolar: current PRIMAVERA period...');
        await this.selectDevExpressDropdown(page, '#ucCicloEscolar', 'PRIMAVERA');
        await page.waitForTimeout(3000); // Wait for horarios table to load

        // Take screenshot after filling all filters
        await page.screenshot({ path: `${debugDir}/filters-filled.png` });
        console.log(`📸 Screenshot saved to ${debugDir}/filters-filled.png`);

        // Wait a bit more for the table data to fully load
        await page.waitForTimeout(2000);
    }

    /**
     * Helper to select an option in a DevExpress SelectBox dropdown
     */
    private async selectDevExpressDropdown(page: Page, selector: string, searchText: string): Promise<boolean> {
        try {
            // Click the selectbox to open the dropdown
            const selectBox = await page.$(selector);
            if (!selectBox) {
                console.log(`⚠️ SelectBox ${selector} not found`);
                return false;
            }

            await selectBox.click();
            await page.waitForTimeout(500);

            // Wait for dropdown to appear and find the option containing our text
            const optionSelector = `.dx-popup-content .dx-list-item:has-text("${searchText}")`;

            try {
                await page.waitForSelector(optionSelector, { timeout: 5000 });
                const option = await page.$(optionSelector);
                if (option) {
                    await option.click();
                    console.log(`   ✅ Selected: ${searchText}`);
                    return true;
                }
            } catch {
                // Try alternative: click on any visible item that matches
                const items = await page.$$('.dx-popup-content .dx-list-item');
                for (const item of items) {
                    const text = await item.textContent();
                    if (text && text.toUpperCase().includes(searchText.toUpperCase())) {
                        await item.click();
                        console.log(`   ✅ Selected: ${text}`);
                        return true;
                    }
                }
            }

            // Close dropdown if nothing selected
            await page.keyboard.press('Escape');
            console.log(`   ⚠️ Option "${searchText}" not found in ${selector}`);
            return false;
        } catch (error) {
            console.log(`   ❌ Error selecting ${searchText} in ${selector}:`, error);
            return false;
        }
    }

    /**
     * Extract groups/classes from the horarios table
     * Supports both regular HTML tables and DevExpress DataGrid
     */
    private async extractGroups(page: Page): Promise<ScrapedGroup[]> {
        // Try to find data grid or table - DevExpress uses .dx-datagrid
        const tableSelectors = [
            '.dx-datagrid',
            '.dx-treelist',
            '.dx-gridbase-container',
            'table.dx-datagrid-table',
            'table',
        ];

        let foundSelector: string | null = null;
        for (const selector of tableSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                foundSelector = selector;
                console.log(`📊 Found data container with selector: ${selector}`);
                break;
            } catch {
                console.log(`⏳ Selector ${selector} not found, trying next...`);
            }
        }

        if (!foundSelector) {
            // Save debug info before failing
            await page.screenshot({ path: '/tmp/no-table-error.png' });
            const html = await page.content();
            const fs = await import('fs');
            await fs.promises.writeFile('/tmp/no-table-error.html', html);
            console.log('📸 Debug files saved to /tmp/');
            throw new Error('No table or data grid found on page');
        }

        // Extract data from table rows
        // Handle both regular tables and DevExpress DataGrid
        const groups = await page.evaluate((selector): ScrapedGroup[] => {
            // Get only the FIRST DataGrid on the page (the Horarios table)
            // There are multiple tables on the page, we only want the first one
            const firstDataGrid = document.querySelector('.dx-datagrid');
            if (!firstDataGrid) {
                console.log('No DataGrid found');
                return [];
            }

            // Get rows only from the first DataGrid
            let rows = Array.from(firstDataGrid.querySelectorAll('.dx-datagrid-rowsview .dx-data-row'));

            // Fallback to regular table rows if no DevExpress rows found
            if (rows.length === 0) {
                rows = Array.from(firstDataGrid.querySelectorAll('tbody tr'));
            }

            console.log(`Found ${rows.length} rows to process`);
            const result: ScrapedGroup[] = [];

            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) continue; // Skip invalid rows

                const asignatura = cells[0]?.textContent?.trim() || '';
                const nivel = cells[1]?.textContent?.trim() || '';
                const lugar = cells[3]?.textContent?.trim() || '';

                // Extract schedule (columns 4-10)
                const schedule: {
                    lunes?: string;
                    martes?: string;
                    miercoles?: string;
                    jueves?: string;
                    viernes?: string;
                    sabado?: string;
                    domingo?: string;
                } = {};
                const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

                days.forEach((day, index) => {
                    const cellIndex = 4 + index;
                    if (cells[cellIndex]) {
                        const time = cells[cellIndex]?.textContent?.trim();
                        if (time && time !== '-' && time !== '') {
                            schedule[day] = time;
                        }
                    }
                });

                // Extract code from asignatura (e.g., "RC.06661.2873.5-5 DESARROLLO DE...")
                const codeMatch = asignatura.match(/^([A-Z]{2}\.\d+\.\d+\.\d+-\d+)/);
                const code = codeMatch ? codeMatch[1] : asignatura.substring(0, 20);
                const name = codeMatch ? asignatura.replace(codeMatch[1], '').trim() : asignatura;

                result.push({
                    code,
                    name,
                    level: nivel,
                    classroom: lugar,
                    schedule,
                });
            }

            return result;
        }, foundSelector);

        console.log(`📊 Extracted ${groups.length} groups from page`);
        return groups;
    }

    /**
     * Scrape students for a specific group (standalone - creates new session)
     * @deprecated Use scrapeAllStudentsInSession for better efficiency
     */
    async scrapeStudents(
        email: string,
        password: string,
        groupCode: string
    ): Promise<{ success: boolean; students: ScrapedStudent[]; error?: string }> {
        if (!this.browser) {
            await this.init();
        }

        const context = await this.browser!.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });

        const page = await context.newPage();
        const debugDir = './debug-screenshots';

        try {
            // Login
            console.log(`🔐 Logging in as ${email}...`);
            await this.login(page, email, password);

            // Navigate to Control de Asistencia
            console.log('📋 Navigating to Control de Asistencia...');
            await this.navigateToControlAsistencia(page);

            // Select group and extract students
            console.log(`📝 Selecting group ${groupCode}...`);
            await this.fillAsistenciaFilters(page, groupCode, debugDir);

            console.log('📊 Extracting students...');
            const students = await this.extractStudents(page);

            console.log(`✅ Scraped ${students.length} students`);

            return { success: true, students };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Student scraping failed:', errorMessage);
            await page.screenshot({ path: `${debugDir}/students-error.png` });
            return { success: false, students: [], error: errorMessage };
        } finally {
            await context.close();
        }
    }

    /**
     * Scrape students for ALL groups in a single login session
     * Much more efficient than calling scrapeStudents per group
     * @returns Map of groupCode -> students array
     */
    async scrapeAllStudentsInSession(
        email: string,
        password: string,
        groupCodes: string[]
    ): Promise<{ success: boolean; studentsByGroup: Map<string, ScrapedStudent[]>; errors: string[] }> {
        if (!this.browser) {
            await this.init();
        }

        const context = await this.browser!.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });

        const page = await context.newPage();
        const debugDir = './debug-screenshots';
        const studentsByGroup = new Map<string, ScrapedStudent[]>();
        const errors: string[] = [];

        try {
            // Step 1: Login ONCE
            console.log(`🔐 Logging in as ${email}...`);
            await this.login(page, email, password);

            // Step 2: Navigate to Control de Asistencia
            console.log('📋 Navigating to Control de Asistencia...');
            await this.navigateToControlAsistencia(page);

            // Wait for page to fully load (ciclo ya seleccionado por defecto)
            await page.waitForTimeout(3000);


            // Step 4: For each group, select it and extract students
            for (let i = 0; i < groupCodes.length; i++) {
                const groupCode = groupCodes[i];
                console.log(`\n👥 [${i + 1}/${groupCodes.length}] Processing group: ${groupCode}`);

                try {
                    // Click on the group in the Grupos table
                    const students = await this.selectGroupAndExtractStudents(page, groupCode, debugDir);
                    studentsByGroup.set(groupCode, students);
                    console.log(`   ✅ Extracted ${students.length} students`);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`${groupCode}: ${errorMsg}`);
                    console.log(`   ❌ Failed: ${errorMsg}`);
                }
            }

            console.log(`\n✅ Completed scraping ${groupCodes.length} groups`);
            return { success: true, studentsByGroup, errors };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Session scraping failed:', errorMessage);
            await page.screenshot({ path: `${debugDir}/session-error.png` });
            return { success: false, studentsByGroup, errors: [errorMessage, ...errors] };
        } finally {
            await context.close();
        }
    }

    /**
     * Select a specific group and extract its students (within an existing session)
     */
    private async selectGroupAndExtractStudents(
        page: Page,
        groupCode: string,
        debugDir: string
    ): Promise<ScrapedStudent[]> {
        const fs = await import('fs');
        await fs.promises.mkdir(debugDir, { recursive: true });

        // Wait for Grupos table
        await page.waitForSelector('#grdGrupos .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });

        // Find and click the matching group row
        const groupRows = await page.$$('#grdGrupos .dx-datagrid-rowsview .dx-data-row');
        let groupClicked = false;
        const codeMatch = groupCode.match(/RC\.\d+\.\d+\.\d+-\d+/);
        const searchPattern = codeMatch ? codeMatch[0] : groupCode;

        console.log(`   🔍 Searching for: ${searchPattern} in ${groupRows.length} rows`);

        for (const row of groupRows) {
            const rowText = await row.textContent();

            if (rowText && rowText.includes(searchPattern)) {
                console.log(`   ✅ Found group, clicking...`);
                await row.click();
                groupClicked = true;
                // Wait longer for tables to refresh
                await page.waitForTimeout(3000);
                break;
            }
        }

        if (!groupClicked) {
            console.log(`   ❌ Group ${searchPattern} not found in table`);
            throw new Error(`Group ${groupCode} not found in table`);
        }

        // Wait for Semanas table to update (it should show this group's weeks)
        console.log(`   ⏳ Waiting for Semanas table...`);
        try {
            await page.waitForSelector('#grdSemanas .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
        } catch {
            console.log(`   ⚠️ No weeks found for this group`);
            return [];
        }

        const weekRows = await page.$$('#grdSemanas .dx-datagrid-rowsview .dx-data-row');
        console.log(`   📅 Found ${weekRows.length} weeks`);

        if (weekRows.length === 0) {
            console.log(`   ⚠️ No week rows to click`);
            return [];
        }

        // Click FIRST week row (must click, even if one was already selected)
        console.log(`   👆 Clicking week row 1...`);
        await weekRows[0].click();
        await page.waitForTimeout(3000);

        // Wait for Asistencia table to load
        console.log(`   ⏳ Waiting for Asistencia table...`);
        try {
            await page.waitForSelector('#grdAsistencias .dx-datagrid-rowsview .dx-data-row', { timeout: 15000 });
            console.log(`   ✅ Asistencia table loaded`);
        } catch {
            console.log(`   ⚠️ Asistencia table did not load`);
            await page.screenshot({ path: `${debugDir}/no-asistencia-${searchPattern}.png` });
            return [];
        }

        // Take screenshot for debugging
        await page.screenshot({ path: `${debugDir}/students-${searchPattern}.png` });

        // Extract students
        const students = await this.extractStudents(page);
        console.log(`   📊 Extracted ${students.length} students for ${searchPattern}`);

        return students;
    }

    /**
     * Navigate to Control de Asistencia page via direct URL
     */
    private async navigateToControlAsistencia(page: Page): Promise<void> {
        const debugDir = './debug-screenshots';
        const fs = await import('fs');
        await fs.promises.mkdir(debugDir, { recursive: true });

        // Navigate directly to Control de Asistencia URL instead of using menu
        console.log('🔗 Navigating directly to Control de Asistencia URL...');
        await page.goto('https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/Index', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        // Wait for page content to load
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${debugDir}/control-asistencia-page.png` });
        console.log('📍 Current URL:', page.url());

        // Verify we're on the correct page
        const title = await page.title();
        console.log('📄 Page title:', title);
    }

    /**
     * Fill filters on Control de Asistencia page and select a group
     * The page has: Dependencia académica, Ciclo escolar, and a Groups table
     */
    private async fillAsistenciaFilters(page: Page, groupCode: string, debugDir: string): Promise<void> {
        const fs = await import('fs');
        await fs.promises.mkdir(debugDir, { recursive: true });

        // Wait for page to fully load (ciclo ya seleccionado por defecto)
        await page.waitForTimeout(3000);

        // Step 1: Wait for Grupos table to have data and click the row matching our group
        console.log(`1️⃣ Looking for group: ${groupCode}...`);

        // Wait for the Grupos grid to have data rows
        try {
            await page.waitForSelector('#grdGrupos .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
        } catch {
            console.log('⚠️ Grupos table not found or empty');
            await page.screenshot({ path: `${debugDir}/no-grupos-table.png` });
        }

        // Try to find and click the row that contains our group code
        const groupRows = await page.$$('#grdGrupos .dx-datagrid-rowsview .dx-data-row');
        console.log(`   Found ${groupRows.length} group rows`);

        let groupClicked = false;
        for (const row of groupRows) {
            const rowText = await row.textContent();
            // Check if this row contains our group code (partial match)
            const codeMatch = groupCode.match(/RC\.\d+\.\d+\.\d+-\d+/);
            const searchPattern = codeMatch ? codeMatch[0] : groupCode;

            if (rowText && rowText.includes(searchPattern)) {
                console.log(`   ✅ Found matching group row, clicking...`);
                await row.click();
                groupClicked = true;
                await page.waitForTimeout(2000);
                break;
            }
        }

        if (!groupClicked && groupRows.length > 0) {
            // Click first group row as fallback
            console.log('   ⚠️ Group not found by code, clicking first row...');
            await groupRows[0].click();
            await page.waitForTimeout(2000);
        }

        await page.screenshot({ path: `${debugDir}/asistencia-group-selected.png` });

        // Step 3: Wait for Semanas table to populate and click first week
        console.log('3️⃣ Looking for Semanas table...');

        try {
            await page.waitForSelector('#grdSemanas .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
            console.log('   ✅ Semanas table has data');
        } catch {
            console.log('   ⚠️ Semanas table not found or empty');
            await page.screenshot({ path: `${debugDir}/no-semanas-table.png` });
            return;
        }

        // Click the first week row to load students
        const weekRows = await page.$$('#grdSemanas .dx-datagrid-rowsview .dx-data-row');
        console.log(`   Found ${weekRows.length} week rows`);

        if (weekRows.length > 0) {
            console.log('   ✅ Clicking first week row to load students...');
            await weekRows[0].click();
            await page.waitForTimeout(3000);
        }

        await page.screenshot({ path: `${debugDir}/asistencia-week-selected.png` });

        // Step 4: Wait for Asistencia table to load
        console.log('4️⃣ Waiting for Asistencia table to load...');

        try {
            await page.waitForSelector('#grdAsistencias .dx-datagrid-rowsview .dx-data-row', { timeout: 15000 });
            console.log('   ✅ Asistencia table has data!');
        } catch {
            console.log('   ⚠️ Asistencia table did not load');
            // Try clicking the Asistencia collapsible header to expand it
            const asistenciaHeader = await page.$('.dx-accordion-item:has-text("Asistencia") .dx-accordion-item-title');
            if (asistenciaHeader) {
                console.log('   🔄 Trying to expand Asistencia section...');
                await asistenciaHeader.click();
                await page.waitForTimeout(2000);
            }
        }

        await page.screenshot({ path: `${debugDir}/asistencia-final.png` });

        // Save HTML for debugging
        const html = await page.content();
        await fs.promises.writeFile(`${debugDir}/asistencia-page.html`, html);
    }

    /**
     * Extract students from the Control de Asistencia table
     * The student table is #grdAsistencias with columns: No., Nombre, and attendance days
     */
    private async extractStudents(page: Page): Promise<ScrapedStudent[]> {
        const debugDir = './debug-screenshots';

        // Wait for the attendance grid to appear (it shows after clicking a week)
        try {
            await page.waitForSelector('#grdAsistencias .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
            console.log('📊 Found attendance grid with data');
        } catch {
            console.log('⚠️ No student data in grdAsistencias, trying alternative selectors...');
            await page.screenshot({ path: `${debugDir}/no-student-grid.png` });

            // Save HTML for debugging
            const fs = await import('fs');
            const html = await page.content();
            await fs.promises.writeFile(`${debugDir}/no-student-grid.html`, html);
        }

        // Extract students from the attendance table
        // Structure: Column 0 = No., Column 1 = Nombre, Columns 2+ = attendance days
        const students = await page.evaluate((): ScrapedStudent[] => {
            const result: ScrapedStudent[] = [];

            // Find the attendance grid specifically
            const dataGrid = document.querySelector('#grdAsistencias');
            if (!dataGrid) {
                console.log('grdAsistencias not found');
                return result;
            }

            // Get all data rows
            const rows = Array.from(dataGrid.querySelectorAll('.dx-datagrid-rowsview .dx-data-row'));
            console.log(`Found ${rows.length} student rows`);

            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) continue;

                // Column 0 = No. (row number)
                // Column 1 = Nombre (student name)
                const rowNum = cells[0]?.textContent?.trim() || '';
                const name = cells[1]?.textContent?.trim() || '';

                // Use the row number as matricula placeholder (actual matricula may not be shown)
                // The No. column seems to the the student number in the list
                if (name) {
                    result.push({
                        matricula: rowNum,
                        name: name
                    });
                }
            }

            return result;
        });

        await page.screenshot({ path: `${debugDir}/students-extracted.png` });
        console.log(`📊 Extracted ${students.length} students`);

        return students;
    }
}

// Singleton instance
export const scraperService = new ScraperService();
