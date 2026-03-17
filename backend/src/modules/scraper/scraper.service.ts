import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { UAT_SELECTORS, UAT_URLS } from './uat-selectors.js';
import { env } from '../../core/config/env.js';

export interface ScrapedGroup {
    code: string;
    name: string;
    level: string;
    classroom: string;
    groupLetter: string; // K, M, etc. - the letter that differentiates groups with same code
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

export interface AttendanceUploadStudent {
    studentId: string;
    matricula: string;
    name: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

/**
 * UAT Portal Scraper Service
 * Handles login and data extraction from the university portal
 */
export class ScraperService {
    private browser: Browser | null = null;
    private readonly isDebugMode: boolean;

    constructor() {
        this.isDebugMode = env.NODE_ENV !== 'production';
    }

    /**
     * Save a debug screenshot only in non-production environments
     */
    private async debugScreenshot(page: Page, path: string): Promise<void> {
        if (!this.isDebugMode) return;
        try {
            await page.screenshot({ path });
        } catch {
            console.log(`⚠️ Could not save debug screenshot: ${path}`);
        }
    }

    /**
     * Save a debug file only in non-production environments
     */
    private async debugSaveFile(content: string, path: string): Promise<void> {
        if (!this.isDebugMode) return;
        try {
            await this.debugSaveFile(path, content);
        } catch {
            console.log(`⚠️ Could not save debug file: ${path}`);
        }
    }

    /**
     * Ensure debug directory exists (only in debug mode)
     */
    private async ensureDebugDir(dir: string): Promise<void> {
        if (!this.isDebugMode) return;
        const fs = await import('fs');
        await fs.promises.mkdir(dir, { recursive: true });
    }

    /**
     * Initialize the browser instance
     */
    async init(): Promise<void> {
        if (this.browser) return;

        const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
        console.log(`🌐 Initializing browser${executablePath ? ` with system Chromium: ${executablePath}` : ' with Playwright bundled Chromium'}`);

        this.browser = await chromium.launch({
            headless: true,
            executablePath,
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
        await page.waitForTimeout(2000);

        // Fill credentials - DevExpress inputs
        console.log('📝 Filling credentials...');
        await page.fill(UAT_SELECTORS.LOGIN.EMAIL_INPUT, email);
        await page.waitForTimeout(300);
        await page.fill(UAT_SELECTORS.LOGIN.PASSWORD_INPUT, password);
        await page.waitForTimeout(300);

        // Check privacy checkbox (required by UAT portal)
        // IMPORTANT: Click directly on the checkbox ICON, not the text label
        // Clicking the text opens an unnecessary privacy popup dialog
        console.log('☑️ Accepting privacy terms...');
        try {
            // Use force:true because the dx-checkbox-icon may not report as "visible"
            // to Playwright even though it's clickable (DevExpress CSS quirk).
            await page.click(UAT_SELECTORS.LOGIN.PRIVACY_CHECKBOX, {
                force: true,
                timeout: 10000,
            });
            await page.waitForTimeout(500);
        } catch {
            console.log('⚠️ Privacy checkbox icon not found, trying container...');
            try {
                await page.click('#chkAcepto', { force: true, timeout: 5000 });
                await page.waitForTimeout(500);
            } catch {
                console.log('⚠️ Privacy checkbox not clickable, continuing...');
            }
        }

        // Submit login using Promise.all to wait for navigation
        console.log('🔘 Clicking login button...');

        // Click the login button
        await page.click(UAT_SELECTORS.LOGIN.SUBMIT_BUTTON, { force: true });

        // Wait for either menu to appear OR page to change OR error message
        console.log('⏳ Waiting for portal to load after login...');

        try {
            // Use Promise.race to detect any of these conditions
            // Timeout increased to 60s because UAT portal can be very slow
            await Promise.race([
                page.waitForSelector('#treeViewMenuPrincipal', { timeout: 60000 }),
                page.waitForSelector('.dx-invalid-message:visible', { timeout: 60000 }),
                page.waitForURL(/.*Profesor.*/, { timeout: 60000 }),
            ]);
        } catch (e) {
            // Timeout - check current state
            console.log('⏳ Initial wait timed out (60s), checking page state...');
        }

        // Additional wait for JS to settle
        await page.waitForTimeout(2000);

        // Check if we got an error message
        const errorElement = await page.$('.dx-invalid-message');
        if (errorElement) {
            const errorText = await errorElement.textContent();
            if (errorText && (errorText.includes('Usuario') || errorText.includes('contraseña') || errorText.includes('incorrecto'))) {
                throw new Error(`Login failed: ${errorText}`);
            }
        }

        // Check for the menu (sign of successful login)
        const menu = await page.$('#treeViewMenuPrincipal');
        if (menu) {
            console.log('🔓 Login successful - menu detected');
            console.log('📍 Current URL:', page.url());
            return;
        }

        // Check if we navigated to Profesor area
        const currentUrl = page.url();
        if (currentUrl.includes('Profesor')) {
            console.log('🔓 Login successful - navigated to Profesor area');
            console.log('📍 Current URL:', currentUrl);
            return;
        }

        // Still on login page - login failed
        const loginForm = await page.$(UAT_SELECTORS.LOGIN.SUBMIT_BUTTON);
        if (loginForm) {
            await this.debugScreenshot(page, '/tmp/login-failed.png');

            // Check for credential error messages on the page
            // DevExpress shows validation messages in .dx-invalid-message elements
            const errorMessages = await page.$$eval(
                '.dx-invalid-message, .dx-overlay-content .dx-button-content, .dx-popup-content',
                els => els.map(e => e.textContent?.trim() || '').join(' ')
            );
            console.log('🔍 Error messages found on page:', errorMessages);

            // Check if this looks like a credential error
            const isCredentialError =
                errorMessages.toLowerCase().includes('incorrecto') ||
                errorMessages.toLowerCase().includes('inválido') ||
                errorMessages.toLowerCase().includes('invalid') ||
                errorMessages.toLowerCase().includes('usuario') ||
                errorMessages.toLowerCase().includes('contraseña');

            if (isCredentialError) {
                throw new Error(`CREDENTIAL_ERROR: Contraseña o usuario incorrecto`);
            }

            // Not a credential error - likely portal slow/timeout
            throw new Error(`PORTAL_ERROR: Login failed - portal may be slow. URL: ${currentUrl}`);
        }

        console.log('🔓 Login appears successful (login form gone)');
        console.log('📍 Current URL:', page.url());
    }

    /**
     * Navigate to horarios/schedule page via the DevExpress TreeView menu
     * The menu loads dynamically via JavaScript after login
     * 
     * IMPORTANT: Menu structure varies by professor role:
     * - Some have: Dirección General de Servicios Escolares → Profesor → Consultas
     * - Others have: Secretaría Académica → Dirección General... → Profesor → Consultas
     * 
     * This function handles both cases by expanding all collapsed items until "Profesor" is found.
     */
    private async navigateToHorarios(page: Page): Promise<void> {
        const debugDir = './debug-screenshots';
        await this.ensureDebugDir(debugDir);

        console.log('📍 Current URL:', page.url());

        // Wait for the TreeView menu to have items loaded
        console.log('⏳ Waiting for menu to load...');
        try {
            await page.waitForSelector('#treeViewMenuPrincipal .dx-treeview-item', { timeout: 15000 });
            console.log('✅ Menu items loaded');
        } catch {
            // Save debug info if menu doesn't load
            await this.debugScreenshot(page, `${debugDir}/no-menu.png`);
            const html = await page.content();
            await this.debugSaveFile(html, `${debugDir}/no-menu.html`);
            console.log('⚠️ Menu items not found, saved debug files');
            throw new Error('Menu did not load after login');
        }

        await this.debugScreenshot(page, `${debugDir}/menu-loaded.png`);

        // Save debug HTML for menu state
        const menuHtml = await page.content();
        await this.debugSaveFile(menuHtml, `${debugDir}/menu-loaded.html`);

        // Log all menu items found for debugging
        const menuItems = await page.$$eval('#treeViewMenuPrincipal .dx-treeview-item', items =>
            items.map(item => item.textContent?.trim() || '')
        );
        console.log('📋 Initial menu items found:', menuItems);

        // STEP 1: Expand ALL collapsed toggle buttons until we can see "Profesor"
        // This handles different menu structures (some professors have extra parent menus)
        console.log('🔍 Expanding menu tree to find Profesor...');

        let profesorFound = false;
        let maxIterations = 5; // Prevent infinite loops
        let iteration = 0;

        while (!profesorFound && iteration < maxIterations) {
            iteration++;
            console.log(`   🔄 Expansion iteration ${iteration}...`);

            // Check if "Profesor" is now visible and clickable
            const profesorItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Profesor")');
            if (profesorItem) {
                // Make sure it's the actual "Profesor" menu item, not just text containing "Profesor"
                const profesorText = await profesorItem.textContent();
                if (profesorText?.trim() === 'Profesor') {
                    console.log('   ✅ Found exact "Profesor" menu item');
                    profesorFound = true;
                    break;
                }
            }

            // Find all unexpanded toggle buttons and click them
            const toggleButtons = await page.$$('#treeViewMenuPrincipal .dx-treeview-toggle-item-visibility');
            if (toggleButtons.length === 0) {
                console.log('   ⚠️ No more toggle buttons to expand');
                break;
            }

            // Click each toggle button that's not expanded yet
            for (const toggle of toggleButtons) {
                // Check if this node is already expanded by checking the class
                const isExpanded = await toggle.evaluate(el => {
                    const node = el.closest('.dx-treeview-node');
                    return node?.classList.contains('dx-treeview-node-is-leaf') === false &&
                        node?.querySelector('.dx-treeview-node-container') !== null;
                });

                if (!isExpanded) {
                    await toggle.click();
                    await page.waitForTimeout(1000);
                }
            }

            // Check what items are now visible
            const expandedItems = await page.$$eval('#treeViewMenuPrincipal .dx-treeview-item', items =>
                items.map(item => item.textContent?.trim() || '')
            );
            console.log(`   📋 Menu items after iteration ${iteration}:`, expandedItems);

            // Check again if Profesor is now visible
            const checkProfesor = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Profesor")');
            if (checkProfesor) {
                const text = await checkProfesor.textContent();
                if (text?.trim() === 'Profesor') {
                    profesorFound = true;
                }
            }
        }

        await this.debugScreenshot(page, `${debugDir}/menu-expanded.png`);

        // STEP 2: Click on "Profesor" to expand its submenu
        console.log('🔍 Looking for Profesor menu item to expand...');
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

            await this.debugScreenshot(page, `${debugDir}/profesor-expanded.png`);
        } else {
            console.log('⚠️ Profesor not found in menu - trying to continue anyway');
            await this.debugScreenshot(page, `${debugDir}/profesor-not-found.png`);
        }

        // STEP 3: Look for "Consultas Profesor" or "Consultas" and click it
        console.log('🔍 Looking for Consultas Profesor in TreeView...');

        // Try "Consultas Profesor" first (more specific)
        let consultasItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Consultas Profesor")');

        // If not found, try just "Consultas"
        if (!consultasItem) {
            console.log('   ⚠️ "Consultas Profesor" not found, trying "Consultas"...');
            consultasItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Consultas")');
        }

        if (consultasItem) {
            console.log('🔘 Found Consultas, clicking to navigate...');
            await consultasItem.click();
            await page.waitForTimeout(3000);

            await this.debugScreenshot(page, `${debugDir}/consultas-expanded.png`);
        } else {
            console.log('⚠️ Consultas not found in menu');
        }

        // STEP 4: Check if we need to click "Horarios" separately
        // (In some menu structures, Consultas navigates directly; in others, there's a Horarios submenu)
        console.log('🔍 Checking for Horarios submenu...');
        const horariosItem = await page.$('#treeViewMenuPrincipal .dx-treeview-item:has-text("Horarios")');
        if (horariosItem) {
            console.log('🔘 Found Horarios submenu, clicking...');
            await horariosItem.click();
            await page.waitForTimeout(3000);
        }

        await this.debugScreenshot(page, `${debugDir}/consultas-page.png`);
        console.log('📍 Final URL:', page.url());

        // Now fill the filter form to load horarios data
        console.log('📝 Filling filter form...');
        await this.fillHorariosFilters(page, debugDir);

        // Save final HTML for debugging
        const finalHtml = await page.content();
        await this.debugSaveFile(finalHtml, `${debugDir}/horarios-page.html`);
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

        await this.debugScreenshot(page, `${debugDir}/filters-filled.png`);

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
            await this.debugScreenshot(page, '/tmp/no-table-error.png');
            const html = await page.content();
            await this.debugSaveFile('/tmp/no-table-error.html', html);
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

                // Log raw cell data for debugging
                const cellData = Array.from(cells).slice(0, 6).map((c, i) => `[${i}]="${c?.textContent?.trim() || ''}"`);
                console.log(`📋 Row cells: ${cellData.join(', ')}`);

                const asignatura = cells[0]?.textContent?.trim() || '';
                const nivel = cells[1]?.textContent?.trim() || '';
                // Column 2 might be group letter in some tables
                const possibleGroupLetter = cells[2]?.textContent?.trim() || '';
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

                // Extract code from asignatura (e.g., "RC.06661.2873.5-5 DESARROLLO DE..." or "(RC.06661.2873.5-5) DESARROLLO...")
                // The code may be wrapped in parentheses or have other prefixes
                const codeMatch = asignatura.match(/\(?([A-Z]{2}\.[A-Z0-9]+\.\d+\.\d+-\d+\.?[A-Z0-9]*)\)?/);
                const baseCode = codeMatch ? codeMatch[1] : asignatura.substring(0, 20);
                const name = codeMatch ? asignatura.replace(codeMatch[0], '').trim() : asignatura;

                // Use possibleGroupLetter if it looks like a letter (single char A-Z)
                const groupLetter = /^[A-Z]$/.test(possibleGroupLetter) ? possibleGroupLetter : '';

                // Append group letter to code to make it unique (e.g., RC.06061.2873.5-5-K)
                // This ensures groups with same base code but different letters are distinct
                const code = groupLetter ? `${baseCode}-${groupLetter}` : baseCode;

                result.push({
                    code,
                    name,
                    level: nivel,
                    classroom: lugar,
                    groupLetter,
                    schedule,
                });
            }

            return result;
        }, foundSelector);

        // Log extracted groups (this runs in Node.js, so it will appear in logs)
        console.log(`📊 Extracted ${groups.length} groups from page:`);
        groups.forEach((g, i) => {
            console.log(`   [${i + 1}] code="${g.code}", groupLetter="${g.groupLetter}", name="${g.name.substring(0, 40)}..."`);
        });
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
            await this.debugScreenshot(page, `${debugDir}/students-error.png`);
            return { success: false, students: [], error: errorMessage };
        } finally {
            await context.close();
        }
    }

    /**
     * Scrape students for ALL groups in a single login session
     * Much more efficient than calling scrapeStudents per group
     * @param onProgress - Optional callback to report progress (groupIndex, groupCode)
     * @returns Map of groupCode -> students array
     */
    async scrapeAllStudentsInSession(
        email: string,
        password: string,
        groupCodes: string[],
        onProgress?: (groupIndex: number, groupCode: string) => Promise<void>
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


            // Step 3: For each group, navigate fresh and extract students
            for (let i = 0; i < groupCodes.length; i++) {
                const groupCode = groupCodes[i];
                console.log(`\n👥 [${i + 1}/${groupCodes.length}] Processing group: ${groupCode}`);

                // Report progress before processing each group
                if (onProgress) {
                    await onProgress(i, groupCode);
                }

                try {
                    // Navigate to Control de Asistencia fresh for each group
                    // This ensures clean state - avoids accordion visibility issues
                    console.log(`   🔄 Navigating to Control de Asistencia...`);
                    await page.goto('https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/Index', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });

                    // Wait for Grupos table to be visible (this is what we need, not networkidle)
                    await page.waitForSelector('#grdGrupos .dx-datagrid-rowsview .dx-data-row', {
                        state: 'visible',
                        timeout: 15000,
                    });
                    await page.waitForTimeout(1000); // Small delay for UI to settle

                    // Click on the group in the Grupos table
                    const students = await this.selectGroupAndExtractStudents(page, groupCode, debugDir);
                    studentsByGroup.set(groupCode, students);
                    console.log(`   ✅ Extracted ${students.length} students`);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`${groupCode}: ${errorMsg}`);
                    console.log(`   ❌ Failed: ${errorMsg}`);

                    // Take screenshot of the error state
                    await this.debugScreenshot(page, `${debugDir}/error-group-${i + 1}.png`);
                }
            }

            console.log(`\n✅ Completed scraping ${groupCodes.length} groups`);
            return { success: true, studentsByGroup, errors };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Session scraping failed:', errorMessage);
            await this.debugScreenshot(page, `${debugDir}/session-error.png`);
            return { success: false, studentsByGroup, errors: [errorMessage, ...errors] };
        } finally {
            await context.close();
        }
    }

    /**
     * Submit attendance for a single group and date
     * Idempotent: reads checkbox state before clicking
     */
    async submitAttendanceForGroup(params: {
        email: string;
        password: string;
        groupCode: string;
        date: string; // YYYY-MM-DD
        students: AttendanceUploadStudent[];
        onProgress?: (studentName: string, index: number) => Promise<void>;
    }): Promise<void> {
        const { email, password, groupCode, date, students, onProgress } = params;

        if (!this.browser) {
            await this.init();
        }

        const context = await this.browser!.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });

        const page = await context.newPage();
        // Use generous timeouts for login (portal can be slow)
        page.setDefaultNavigationTimeout(60000);
        const debugDir = './debug-screenshots';

        try {
            console.log(`🔐 Logging in as ${email}...`);
            await this.login(page, email, password);

            // After login, tighten timeouts to fail fast on scraping errors
            page.setDefaultTimeout(15000);
            page.setDefaultNavigationTimeout(30000);

            console.log('📋 Navigating to Control de Asistencia...');
            await this.navigateToControlAsistencia(page);

            console.log(`📝 Selecting group ${groupCode}...`);
            const groupSelected = await this.findAndClickGroupRow(page, groupCode, debugDir);
            if (!groupSelected) {
                throw new Error(`Group ${groupCode} not found in Control de Asistencia`);
            }

            console.log(`📅 Selecting week for date ${date}...`);
            await this.selectWeekContainingDate(page, date, debugDir);

            console.log('🔎 Resolving attendance column...');
            // Ensure Asistencia section is expanded before reading headers
            await this.expandAccordionSection(page, 'Asistencia');
            const columnIndex = await this.getAttendanceColumnIndex(page, date);

            console.log(`📋 Setting attendance for ${students.length} students (column ${columnIndex})...`);
            for (let i = 0; i < students.length; i++) {
                const student = students[i];
                const desiredChecked = student.status !== 'ABSENT';

                if (onProgress) {
                    await onProgress(student.name, i);
                }

                await this.setStudentAttendanceState(
                    page,
                    student,
                    columnIndex,
                    desiredChecked
                );
            }

            console.log('💾 Saving attendance via GuardarGenericoPantalla()...');
            await this.saveAttendance(page, debugDir);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Attendance submission failed:', errorMessage);
            await this.debugScreenshot(page, `${debugDir}/attendance-upload-error.png`);
            throw error;
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
        await this.ensureDebugDir(debugDir);

        const debugKey = groupCode.replace(/[^A-Za-z0-9_.-]/g, '_');

        const groupClicked = await this.findAndClickGroupRow(page, groupCode, debugDir);

        if (!groupClicked) {
            throw new Error(`Group ${groupCode} not found in table`);
        }

        // Wait for Semanas table to update (it should show this group's weeks)
        console.log(`   ⏳ Waiting for Semanas table...`);
        await this.expandAccordionSection(page, 'Semanas');
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
        await weekRows[0].evaluate((el) => (el as HTMLElement).click());
        await page.waitForTimeout(3000);

        // Expand the Asistencia accordion section
        await this.expandAccordionSection(page, 'Asistencia');

        // Wait for Asistencia table to load
        console.log(`   ⏳ Waiting for Asistencia table...`);
        try {
            await page.waitForSelector('#grdAsistencias .dx-datagrid-rowsview .dx-data-row', { timeout: 15000 });
            console.log(`   ✅ Asistencia table loaded`);
        } catch {
            console.log(`   ⚠️ Asistencia table did not load`);
            await this.debugScreenshot(page, `${debugDir}/no-asistencia-${debugKey}.png`);
            return [];
        }

        await this.debugScreenshot(page, `${debugDir}/students-${debugKey}.png`);

        // Extract students
        const students = await this.extractStudents(page);
        console.log(`   📊 Extracted ${students.length} students for ${groupCode}`);

        return students;
    }

    /**
     * Expand a DevExpress Accordion section by its title text.
     * The portal uses accordion panels for Busqueda, Grupos, Semanas, Asistencia.
     * If a section is collapsed, its content (grids) is in the DOM but not visible.
     */
    private async expandAccordionSection(page: Page, sectionTitle: string): Promise<void> {
        // Check if the section's content is already visible by looking at the
        // accordion-item's 'opened' state.
        const expanded = await page.evaluate((title) => {
            const items = Array.from(document.querySelectorAll('.dx-accordion-item'));
            for (const item of items) {
                const titleEl = item.querySelector('.dx-accordion-item-title');
                if (titleEl && titleEl.textContent?.trim().includes(title)) {
                    // DevExpress marks opened items with dx-accordion-item-opened
                    if (item.classList.contains('dx-accordion-item-opened')) {
                        return true; // already expanded
                    }
                    // Click the title to expand
                    (titleEl as HTMLElement).click();
                    return false; // was collapsed, now expanding
                }
            }
            return true; // section not found, assume it's fine
        }, sectionTitle);

        if (!expanded) {
            console.log(`   📂 Expanded accordion section: ${sectionTitle}`);
            await page.waitForTimeout(1000); // wait for animation
        }
    }

    private async findAndClickGroupRow(
        page: Page,
        groupCode: string,
        debugDir: string
    ): Promise<boolean> {
        await this.ensureDebugDir(debugDir);

        // Ensure the Grupos accordion section is expanded
        await this.expandAccordionSection(page, 'Grupos');

        await page.waitForSelector('#grdGrupos .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });

        const groupRows = await page.$$('#grdGrupos .dx-datagrid-rowsview .dx-data-row');
        let groupClicked = false;

        const letterMatch = groupCode.match(/-([A-Z])$/);
        const targetGroupLetter = letterMatch ? letterMatch[1] : null;

        const codeWithoutLetter = groupCode.replace(/-[A-Z]$/, '');
        const codeMatch = codeWithoutLetter.match(/RC\.[A-Z0-9]+\.\d+\.\d+-\d+(?:\.[A-Z0-9]+)?/);
        const searchPattern = codeMatch ? codeMatch[0] : codeWithoutLetter;

        console.log(`   🔍 Searching for: ${searchPattern}, group letter: ${targetGroupLetter || 'any'} in ${groupRows.length} rows`);

        for (const row of groupRows) {
            const rowText = await row.textContent();
            if (rowText && rowText.includes(searchPattern)) {
                if (targetGroupLetter) {
                    const cells = await row.$$('td');
                    if (cells.length > 0) {
                        const firstCellText = await cells[0].textContent();
                        const rowGroupLetter = firstCellText?.trim() || '';
                        if (rowGroupLetter !== targetGroupLetter) {
                            continue;
                        }
                    }
                }

                console.log(`   ✅ Found matching group, clicking...`);
                // Use JS click to avoid visibility issues inside accordion panels
                await row.evaluate((el) => (el as HTMLElement).click());
                groupClicked = true;
                await page.waitForTimeout(3000);
                break;
            }
        }

        if (!groupClicked) {
            console.log(`   ❌ Group ${searchPattern} not found in table`);
            await this.debugScreenshot(page, `${debugDir}/group-not-found.png`);
        }

        return groupClicked;
    }

    private async selectWeekContainingDate(
        page: Page,
        date: string,
        debugDir: string
    ): Promise<void> {
        const target = new Date(`${date}T00:00:00`);
        const targetDay = target.getDate();
        const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
        const targetDayName = dayNames[target.getDay()];

        // Expand the Semanas accordion section (might be collapsed after group click)
        await this.expandAccordionSection(page, 'Semanas');

        await page.waitForSelector('#grdSemanas .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
        const weekRows = await page.$$('#grdSemanas .dx-datagrid-rowsview .dx-data-row');

        if (weekRows.length === 0) {
            throw new Error('No week rows available');
        }

        console.log(`   📅 Found ${weekRows.length} week rows, looking for day ${targetDayName} ${targetDay}`);

        // First, try to find the right week by reading date ranges from the table
        // (avoids clicking each row): columns are Semana, Fecha Inicial, Fecha Final, Capturada
        const weekIndex = await page.evaluate<number, { targetDateStr: string }>(
            ({ targetDateStr }) => {
                const targetDate = new Date(targetDateStr + 'T00:00:00');
                const rows = Array.from(document.querySelectorAll('#grdSemanas .dx-datagrid-rowsview .dx-data-row'));
                for (let i = 0; i < rows.length; i++) {
                    const cells = rows[i].querySelectorAll('td');
                    // cells[1] = Fecha Inicial (DD/MM/YYYY), cells[2] = Fecha Final (DD/MM/YYYY)
                    const startText = cells[1]?.textContent?.trim() || '';
                    const endText = cells[2]?.textContent?.trim() || '';
                    // Parse DD/MM/YYYY
                    const parseDate = (s: string) => {
                        const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (!m) return null;
                        return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
                    };
                    const start = parseDate(startText);
                    const end = parseDate(endText);
                    if (start && end && targetDate >= start && targetDate <= end) {
                        return i;
                    }
                }
                return -1;
            },
            { targetDateStr: date }
        );

        if (weekIndex >= 0) {
            console.log(`   ✅ Date ${date} is in week row ${weekIndex + 1}, clicking...`);
            // Use JS click to avoid visibility issues inside accordion panels
            await weekRows[weekIndex].evaluate((el) => (el as HTMLElement).click());
            await page.waitForTimeout(2000);

            // Expand Asistencia accordion section
            await this.expandAccordionSection(page, 'Asistencia');

            // Wait for the attendance DATA rows to load (not just the header)
            try {
                await page.waitForSelector('#grdAsistencias .dx-datagrid-rowsview .dx-data-row', { timeout: 15000 });
                console.log(`   ✅ Asistencia data rows loaded`);
            } catch {
                throw new Error(`Asistencia table did not load after selecting week for ${date}`);
            }
            return;
        }

        // Fallback: click each week row and check headers
        console.log(`   ⚠️ Could not find week by date range, trying each row...`);
        for (const [index, row] of weekRows.entries()) {
            await row.evaluate((el) => (el as HTMLElement).click());
            await page.waitForTimeout(2000);

            // Expand Asistencia accordion section
            await this.expandAccordionSection(page, 'Asistencia');

            try {
                await page.waitForSelector('#grdAsistencias .dx-datagrid-headers .dx-header-row', { timeout: 10000 });
            } catch {
                continue;
            }

            const headerMatches = await page.evaluate<boolean, { expectedDay: number; expectedDayName: string }>(
                ({ expectedDay, expectedDayName }) => {
                    const headerRow = document.querySelector('#grdAsistencias .dx-datagrid-headers .dx-header-row');
                    if (!headerRow) return false;
                    const cells = Array.from(headerRow.querySelectorAll('td, th'));
                    return cells.some((cell) => {
                        const text = (cell as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || '';
                        const match = text.match(/(Lu|Ma|Mi|Ju|Vi|Sa|Do)\w*\s*(\d{1,2})/i);
                        if (!match) return false;
                        const dayName = match[1];
                        const dayNum = parseInt(match[2], 10);
                        return dayNum === expectedDay && dayName.toLowerCase() === expectedDayName.toLowerCase();
                    });
                },
                { expectedDay: targetDay, expectedDayName: targetDayName }
            );

            if (headerMatches) {
                console.log(`   ✅ Week row ${index + 1} matches date ${date}`);
                return;
            }
        }

        await this.debugScreenshot(page, `${debugDir}/week-not-found.png`);
        throw new Error(`No week contains date ${date}`);
    }

    private async getAttendanceColumnIndex(page: Page, date: string): Promise<number> {
        const target = new Date(`${date}T00:00:00`);
        const targetDay = target.getDate();
        const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
        const targetDayName = dayNames[target.getDay()];

        // DevExpress DataGrid uses multi-row (banded) headers:
        //   Row 0: "No." (rowspan=2), "Nombre" (rowspan=2), band-header (colspan=N)
        //   Row 1: "Lu 9", "Ma 10", "Mi 11", "Ju 12", "Vi 13"
        // Data rows are flat: [No., Nombre, Lu, Ma, Mi, Ju, Vi]
        // So day column index in data row = (index in day header row) + offset
        // where offset = (data row cell count) - (day header row cell count)

        interface HeaderInfo { rowIdx: number; cellIdx: number; text: string; innerText: string }
        let allHeaders: HeaderInfo[] = [];
        let dataColCount = 0;

        for (let attempt = 0; attempt < 5; attempt++) {
            const result = await page.evaluate(() => {
                const headerRows = Array.from(
                    document.querySelectorAll('#grdAsistencias .dx-datagrid-headers .dx-header-row')
                );
                const headers: { rowIdx: number; cellIdx: number; text: string; innerText: string }[] = [];
                headerRows.forEach((row, rowIdx) => {
                    Array.from(row.querySelectorAll('td, th')).forEach((cell, cellIdx) => {
                        headers.push({
                            rowIdx,
                            cellIdx,
                            text: cell.textContent?.replace(/\s+/g, ' ').trim() || '',
                            innerText: (cell as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || '',
                        });
                    });
                });
                // Count cells in first data row to determine flat column count
                const firstDataRow = document.querySelector('#grdAsistencias .dx-datagrid-rowsview .dx-data-row');
                const dataCols = firstDataRow ? firstDataRow.querySelectorAll('td').length : 0;
                return { headers, dataCols };
            });

            allHeaders = result.headers;
            dataColCount = result.dataCols;

            const hasDayColumns = allHeaders.some(h =>
                /(Lu|Ma|Mi|Ju|Vi|Sa|Do)/i.test(h.text) || /(Lu|Ma|Mi|Ju|Vi|Sa|Do)/i.test(h.innerText)
            );
            if (hasDayColumns) break;

            console.log(`   ⏳ Headers not ready yet (attempt ${attempt + 1}), waiting...`);
            await page.waitForTimeout(2000);
        }

        // Log ALL header rows for debugging
        const rowGroups = new Map<number, HeaderInfo[]>();
        for (const h of allHeaders) {
            if (!rowGroups.has(h.rowIdx)) rowGroups.set(h.rowIdx, []);
            rowGroups.get(h.rowIdx)!.push(h);
        }
        for (const [rowIdx, cells] of rowGroups) {
            console.log(`   📋 Header row ${rowIdx}: ${cells.map(c => `[${c.cellIdx}] "${c.text}"`).join(', ')}`);
        }
        console.log(`   📊 Data row has ${dataColCount} columns`);
        console.log(`   🎯 Looking for: ${targetDayName} ${targetDay}`);

        // Find the header row that contains day columns
        for (const h of allHeaders) {
            for (const rawText of [h.text, h.innerText]) {
                const match = rawText.match(/(Lu|Ma|Mi|Ju|Vi|Sa|Do)\w*\s*(\d{1,2})/i);
                if (!match) continue;
                const dayName = match[1];
                const dayNum = parseInt(match[2], 10);
                if (dayNum === targetDay && dayName.toLowerCase() === targetDayName.toLowerCase()) {
                    // Calculate offset: how many columns before this header row in the data row
                    const dayRowCells = rowGroups.get(h.rowIdx)!;
                    const offset = dataColCount - dayRowCells.length;
                    const dataColumnIndex = h.cellIdx + offset;
                    console.log(`   ✅ Found "${rawText}" in header row ${h.rowIdx} cell ${h.cellIdx}, offset=${offset}, data column=${dataColumnIndex}`);
                    return dataColumnIndex;
                }
            }
        }

        // Take screenshot for debugging
        await this.debugScreenshot(page, './debug-screenshots/column-not-found.png');
        throw new Error(`Attendance column not found for date ${date} (headers: ${allHeaders.map(h => `r${h.rowIdx}[${h.cellIdx}]="${h.text}"`).join(', ')})`);
    }

    private async setStudentAttendanceState(
        page: Page,
        student: AttendanceUploadStudent,
        columnIndex: number,
        desiredChecked: boolean
    ): Promise<void> {
        // The UAT portal uses plain <input type="checkbox"> elements with IDs like cbPl_{dia}_{id_alumno}_{num_pase_lista}
        // Multi-hour classes have MULTIPLE checkboxes within the SAME cell (one per hour/pase de lista).
        // GuardarGenericoPantalla() reads the .checked property of each input to build the save payload.
        // We need to set ALL checkboxes in the target cell, not just the first one.
        const result = await page.evaluate<
            { found: boolean; name?: string; totalCheckboxes?: number; changedCount?: number },
            { targetName: string; targetMatricula: string; colIndex: number; checked: boolean }
        >(
            ({ targetName, targetMatricula, colIndex, checked }) => {
                const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
                const rows = Array.from(document.querySelectorAll('#grdAsistencias .dx-datagrid-rowsview .dx-data-row'));
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    const nameCell = cells[1]?.textContent || '';
                    const rowText = row.textContent || '';
                    if (
                        normalize(nameCell) === normalize(targetName) ||
                        normalize(rowText).includes(normalize(targetName)) ||
                        (targetMatricula && normalize(rowText).includes(normalize(targetMatricula)))
                    ) {
                        const cell = cells[colIndex];
                        // Use querySelectorAll to find ALL checkboxes in this cell (multi-hour support)
                        const inputs = cell?.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement> | undefined;
                        if (inputs && inputs.length > 0) {
                            let changedCount = 0;
                            for (const input of Array.from(inputs)) {
                                if (input.checked !== checked) {
                                    input.checked = checked;
                                    changedCount++;
                                }
                            }
                            return { found: true, name: nameCell.trim(), totalCheckboxes: inputs.length, changedCount };
                        }
                        return { found: true, name: nameCell.trim(), totalCheckboxes: 0, changedCount: 0 };
                    }
                }
                return { found: false };
            },
            { targetName: student.name, targetMatricula: student.matricula, colIndex: columnIndex, checked: desiredChecked }
        );

        if (!result.found) {
            console.log(`   ⚠️ Student not found in grid: ${student.name}`);
        } else {
            const status = desiredChecked ? '✅' : '❌';
            const hoursInfo = result.totalCheckboxes! > 1 ? ` (${result.totalCheckboxes} hours)` : '';
            const changeNote = result.changedCount! > 0 ? ` (${result.changedCount} changed)` : ' (already set)';
            console.log(`   ${status} ${result.name}: ${desiredChecked ? 'PRESENT' : 'ABSENT'}${hoursInfo}${changeNote}`);
        }
    }

    private async saveAttendance(page: Page, debugDir: string): Promise<void> {
        // The UAT portal uses GuardarGenericoPantalla() which:
        // 1. Reads all checkbox .checked states from #grdAsistencias
        // 2. POSTs to /Profesor/ControlAsistencia/GuardaAsistencias
        // 3. Shows success/error alert
        // We intercept the AJAX response to verify success.

        const saveResponsePromise = page.waitForResponse(
            (response) => response.url().includes('GuardaAsistencias'),
            { timeout: 30000 }
        );

        // Call the portal's save function directly
        await page.evaluate(() => {
            (window as any).GuardarGenericoPantalla();
        });

        const response = await saveResponsePromise;
        const responseBody = await response.json();
        console.log(`   📡 Save response: ${JSON.stringify(responseBody)}`);

        if (!responseBody.exito) {
            await this.debugScreenshot(page, `${debugDir}/attendance-save-error.png`);
            throw new Error(`Portal save failed: ${responseBody.mensaje || 'Unknown error'}`);
        }

        console.log(`   ✅ ${responseBody.mensaje}`);
    }

    /**
     * Navigate to Control de Asistencia page via direct URL
     */
    private async navigateToControlAsistencia(page: Page): Promise<void> {
        const debugDir = './debug-screenshots';
        await this.ensureDebugDir(debugDir);

        // Navigate directly to Control de Asistencia URL instead of using menu
        console.log('🔗 Navigating directly to Control de Asistencia URL...');
        await page.goto('https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/Index', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        // Wait for the Grupos grid to be fully rendered with visible rows
        console.log('⏳ Waiting for Grupos grid to render...');
        try {
            await page.waitForSelector('#grdGrupos .dx-datagrid-rowsview .dx-data-row', {
                state: 'visible',
                timeout: 20000,
            });
            console.log('✅ Grupos grid is visible');
        } catch {
            console.log('⚠️ Grupos grid rows not visible after 20s, continuing...');
        }

        // Small extra wait for DevExpress JS to finish initializing
        await page.waitForTimeout(1000);

        await this.debugScreenshot(page, `${debugDir}/control-asistencia-page.png`);
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
        await this.ensureDebugDir(debugDir);

        // Wait for page to fully load (ciclo ya seleccionado por defecto)
        await page.waitForTimeout(3000);

        // Step 1: Wait for Grupos table to have data and click the row matching our group
        console.log(`1️⃣ Looking for group: ${groupCode}...`);

        // Wait for the Grupos grid to have data rows
        try {
            await page.waitForSelector('#grdGrupos .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
        } catch {
            console.log('⚠️ Grupos table not found or empty');
            await this.debugScreenshot(page, `${debugDir}/no-grupos-table.png`);
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

        await this.debugScreenshot(page, `${debugDir}/asistencia-group-selected.png`);

        // Step 3: Wait for Semanas table to populate and click first week
        console.log('3️⃣ Looking for Semanas table...');

        try {
            await page.waitForSelector('#grdSemanas .dx-datagrid-rowsview .dx-data-row', { timeout: 10000 });
            console.log('   ✅ Semanas table has data');
        } catch {
            console.log('   ⚠️ Semanas table not found or empty');
            await this.debugScreenshot(page, `${debugDir}/no-semanas-table.png`);
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

        await this.debugScreenshot(page, `${debugDir}/asistencia-week-selected.png`);

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

        await this.debugScreenshot(page, `${debugDir}/asistencia-final.png`);

        // Save HTML for debugging
        const html = await page.content();
        await this.debugSaveFile(html, `${debugDir}/asistencia-page.html`);
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
            await this.debugScreenshot(page, `${debugDir}/no-student-grid.png`);

            // Save HTML for debugging
            const html = await page.content();
            await this.debugSaveFile(html, `${debugDir}/no-student-grid.html`);
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

        await this.debugScreenshot(page, `${debugDir}/students-extracted.png`);
        console.log(`📊 Extracted ${students.length} students`);

        return students;
    }
}

// Singleton instance
export const scraperService = new ScraperService();
