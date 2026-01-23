/**
 * CSS Selectors for UAT Portal scraping
 * Based on: https://administracionescolar.uat.edu.mx
 * 
 * The UAT portal uses DevExpress (dx) components.
 * Updated selectors based on browser exploration.
 */
export const UAT_SELECTORS = {
    // Login page - DevExpress components
    LOGIN: {
        // Username field: #txtUsuario contains a dx-texteditor-input
        EMAIL_INPUT: '#txtUsuario input.dx-texteditor-input',
        // Password field: #txtContrasenia contains a dx-texteditor-input
        PASSWORD_INPUT: '#txtContrasenia input.dx-texteditor-input',
        // Privacy checkbox - click directly on the checkbox icon, NOT the text label
        // Clicking the text opens a popup dialog (unnecessary step)
        PRIVACY_CHECKBOX: '#chkAcepto .dx-checkbox-icon',
        // Login button
        SUBMIT_BUTTON: '#btnIngresar',
        // Error messages from validation
        ERROR_MESSAGE: '.dx-invalid-message, .dx-overlay-content',
        // Validation error text
        VALIDATION_ERROR: '.dx-invalid',
    },

    // Navigation
    NAV: {
        PROFESSOR_MENU: '.menu-profesor, [href*="Profesor"]',
        CONSULTAS: 'text=Consultas Profesor, a[href*="Consultas"]',
        HORARIOS: 'text=Horarios, .horarios-link',
    },

    // Horarios (Schedule) page - uses DevExpress DataGrid
    HORARIOS: {
        // Search filters - DevExpress components
        NIVEL_EDUCATIVO: '#nivel, .dx-selectbox[id*="nivel"]',
        CAMPUS: '#campus, .dx-selectbox[id*="campus"]',
        DEPENDENCIA: '#dependencia, .dx-selectbox[id*="dependencia"]',
        CICLO_ESCOLAR: '#ciclo, .dx-selectbox[id*="ciclo"]',

        // DevExpress DataGrid selectors
        DATAGRID: '.dx-datagrid',
        DATAGRID_CONTENT: '.dx-datagrid-rowsview',
        DATAGRID_ROWS: '.dx-datagrid-rowsview .dx-data-row',

        // Fallback to regular table
        TABLE: '.dx-datagrid-table, table.horarios, table',
        TABLE_ROWS: '.dx-data-row, table tbody tr',

        // Table columns (0-indexed) - adjust based on actual structure
        COL_ASIGNATURA: 0,
        COL_NIVEL: 1,
        COL_GRUPO: 2,
        COL_LUGAR: 3,
        COL_LUNES: 4,
        COL_MARTES: 5,
        COL_MIERCOLES: 6,
        COL_JUEVES: 7,
        COL_VIERNES: 8,
        COL_SABADO: 9,
        COL_DOMINGO: 10,
    },

    // Control de Asistencia page
    ASISTENCIA: {
        MENU_LINK: 'text=Control De Asistencia, a[href*="Asistencia"]',
        GROUP_SELECT: 'select[name*="grupo"], #grupo',
        DATE_INPUT: 'input[type="date"], #fecha',
        STUDENT_LIST: '.lista-alumnos, table.alumnos',
        STUDENT_ROW: '.alumno-row, table.alumnos tbody tr',
    },

    // Control de Asistencia page - Student Lists
    CONTROL_ASISTENCIA: {
        MENU_LINK: 'a[href*="ControlAsistencia"]',
        GRUPO_SELECT: '#ucGrupo',
        MATERIA_SELECT: '#ucMateria',
        STUDENT_DATAGRID: '.dx-datagrid',
        STUDENT_ROWS: '.dx-datagrid-rowsview .dx-data-row',
        // Column indices (0-indexed) - will be adjusted based on actual structure
        COL_NUMERO: 0,
        COL_MATRICULA: 1,
        COL_NOMBRE: 2,
    },

    // Common
    COMMON: {
        LOADING: '.dx-loadpanel, .dx-overlay, .loading, .spinner',
        MODAL: '.dx-popup, .modal, .dialog',
        CLOSE_MODAL: '.dx-closebutton, .modal .close, .btn-close',
    },
} as const;

/**
 * URLs for UAT Portal
 */
export const UAT_URLS = {
    BASE: 'https://administracionescolar.uat.edu.mx',
    LOGIN: 'https://administracionescolar.uat.edu.mx',  // Main page has login
    PROFESOR_INDEX: 'https://administracionescolar.uat.edu.mx/Profesor',
    CONSULTAS: 'https://administracionescolar.uat.edu.mx/Profesor/Consultas/Index',
    HORARIOS: 'https://administracionescolar.uat.edu.mx/Profesor/Consultas/Horarios',
    CONTROL_ASISTENCIA: 'https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/Index',
} as const;
