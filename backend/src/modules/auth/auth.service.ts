import { prisma } from '../../core/database/prisma.js';
import { rsaService, jwtService } from '../../core/security/index.js';
import { addScrapingJob, storeRetryPassword } from '../../core/queue/queue.config.js';
import type { LoginRequest, AuthResponse } from './auth.schemas.js';

/**
 * Calculate the current academic period based on date
 * Format matches UAT portal: "2026 - 1 PRIMAVERA", "2026 - 2 VERANO", "2026 - 3 OTOÑO"
 * Enero-Mayo = 1 PRIMAVERA, Junio-Julio = 2 VERANO, Agosto-Diciembre = 3 OTOÑO
 */
export function calculateCurrentPeriod(date: Date = new Date()): string {
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    if (month >= 1 && month <= 5) return `${year} - 1 PRIMAVERA`;
    if (month >= 6 && month <= 7) return `${year} - 2 VERANO`;
    return `${year} - 3 OTOÑO`;
}

export class AuthService {
    /**
     * Login a professor (creates account if doesn't exist - upsert behavior)
     * - Validates credentials against UAT portal via scraping
     * - Creates professor in database if first time
     * - Only triggers scraping if period changed
     */
    async login(data: LoginRequest): Promise<AuthResponse> {
        // Decrypt password (only in memory)
        const decryptedPassword = rsaService.decryptPassword(data.encryptedPassword);

        // Calculate current period
        const currentPeriod = calculateCurrentPeriod();

        // Find or create professor (upsert behavior)
        let professor = await prisma.professor.findUnique({
            where: { institutionalEmail: data.institutionalEmail },
        });

        const isNewProfessor = !professor;

        if (isNewProfessor) {
            // Create new professor - name will be updated by scraper
            professor = await prisma.professor.create({
                data: {
                    institutionalEmail: data.institutionalEmail,
                    name: data.institutionalEmail.split('@')[0], // Temporary name from email
                    lastSyncPeriod: currentPeriod,
                },
            });
        }

        // At this point professor is guaranteed to exist
        const prof = professor!;
        const periodChanged = prof.lastSyncPeriod !== currentPeriod;

        // Check if professor has any groups in current period
        const groupCount = await prisma.group.count({
            where: { professorId: prof.id, period: currentPeriod }
        });
        const hasNoGroups = groupCount === 0;

        // Generate JWT token
        const token = jwtService.sign({
            professorId: prof.id,
            email: prof.institutionalEmail,
        });

        // Only queue scraping if:
        // 1. New professor (first login ever)
        // 2. Period changed since last sync
        // 3. Professor has no groups in current period (e.g., previous sync failed)
        const shouldScrape = isNewProfessor || periodChanged || hasNoGroups;

        if (shouldScrape) {
            // Update lastSyncPeriod
            await prisma.professor.update({
                where: { id: prof.id },
                data: { lastSyncPeriod: currentPeriod },
            });

            // Queue scraping job to fetch groups from UAT
            await addScrapingJob({
                professorId: prof.id,
                email: data.institutionalEmail,
                password: decryptedPassword,
            });

            // Store password for retry functionality (30 min TTL)
            await storeRetryPassword(prof.id, decryptedPassword);
        }

        return {
            token,
            profesor: {
                id: prof.id,
                institutionalEmail: prof.institutionalEmail,
                name: prof.name,
            },
            message: shouldScrape
                ? 'Login exitoso. Sincronizando grupos...'
                : 'Login exitoso.',
            currentPeriod,
            needsSync: shouldScrape,
        };
    }

    /**
     * Get professor by ID
     */
    async getProfessor(professorId: string) {
        return prisma.professor.findUnique({
            where: { id: professorId },
        });
    }

    /**
     * Force sync groups for a professor
     */
    async forceSync(
        professorId: string,
        email: string,
        encryptedPassword: string
    ): Promise<{ message: string; currentPeriod: string }> {
        console.log(`🔄 forceSync called for professor ${professorId}`);
        const decryptedPassword = rsaService.decryptPassword(encryptedPassword);
        const currentPeriod = calculateCurrentPeriod();

        // Check if there's already a sync in progress
        const existingSync = await prisma.syncJob.findFirst({
            where: {
                professorId,
                status: { in: ['PENDING', 'IN_PROGRESS'] },
            },
        });

        if (existingSync) {
            console.log(`⚠️ Found existing sync: ${existingSync.id} status=${existingSync.status} started=${existingSync.startedAt}`);

            // If sync has been stuck for more than 10 minutes, mark it as failed and continue
            const stuckThreshold = 10 * 60 * 1000; // 10 minutes
            const syncAge = existingSync.startedAt
                ? Date.now() - existingSync.startedAt.getTime()
                : 0;

            if (syncAge > stuckThreshold) {
                console.log(`🔧 Sync stuck for ${Math.round(syncAge / 60000)} minutes, marking as FAILED`);
                await prisma.syncJob.update({
                    where: { id: existingSync.id },
                    data: {
                        status: 'FAILED',
                        error: 'Sincronización cancelada (timeout automático)',
                        completedAt: new Date(),
                    },
                });
            } else {
                return {
                    message: 'Ya hay una sincronización en proceso. Espera a que termine.',
                    currentPeriod,
                };
            }
        }

        // Update lastSyncPeriod
        await prisma.professor.update({
            where: { id: professorId },
            data: { lastSyncPeriod: currentPeriod },
        });

        console.log(`📤 Queuing scraping job for ${email}`);
        // Queue scraping job
        await addScrapingJob({
            professorId,
            email,
            password: decryptedPassword,
        });

        // Store password for retry functionality (30 min TTL)
        await storeRetryPassword(professorId, decryptedPassword);

        return {
            message: 'Sincronización iniciada...',
            currentPeriod,
        };
    }
}

export const authService = new AuthService();
