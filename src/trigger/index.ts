import { logger, task } from "@trigger.dev/sdk/v3";

// Add mock data interface
interface JobData {
    id: string;
    status: 'COMPLETED' | 'FAILED' | 'RUNNING';
    createdAt: string;
    tasks: TaskData[];
}

interface TaskData {
    id: string;
    name: string;
    status: 'COMPLETED' | 'FAILED' | 'RUNNING';
    startedAt: string;
    completedAt?: string;
    output?: any;
    error?: string;
}

// Mock data store with more varied test cases
const mockJobs: Record<string, JobData> = {
    'job-123': {
        id: 'job-123',
        status: 'COMPLETED',
        createdAt: '2024-03-20T10:00:00Z',
        tasks: [
            {
                id: 'task-1',
                name: 'video-processing',
                status: 'COMPLETED',
                startedAt: '2024-03-20T10:00:05Z',
                completedAt: '2024-03-20T10:05:00Z',
                output: {
                    videoUrl: 'https://example.com/video.mp4'
                }
            }
        ]
    },
    'job-test': {
        id: 'job-test',
        status: 'RUNNING',
        createdAt: new Date().toISOString(),
        tasks: [
            {
                id: 'task-test',
                name: 'test-task',
                status: 'RUNNING',
                startedAt: new Date().toISOString(),
            }
        ]
    }
};

// Add new task for fetching job and task data with enhanced error handling
export const getJobStatusTask = task({
    id: "get-job-status",
    maxDuration: 30000,
    run: async (payload: {
        jobId: string;
        taskId?: string;
    }, { ctx }) => {
        try {
            // Add request logging
            logger.info("Received job status request", {
                jobId: payload.jobId,
                taskId: payload.taskId,
                timestamp: new Date().toISOString()
            });

            // Validate input
            if (!payload.jobId) {
                throw new Error("jobId is required");
            }

            const job = mockJobs[payload.jobId];
            
            if (!job) {
                return {
                    success: false,
                    error: `Job not found with ID: ${payload.jobId}`,
                    code: 'JOB_NOT_FOUND'
                };
            }

            // If taskId is provided, return specific task data
            if (payload.taskId) {
                const task = job.tasks.find(t => t.id === payload.taskId);
                if (!task) {
                    return {
                        success: false,
                        error: `Task not found with ID: ${payload.taskId}`,
                        code: 'TASK_NOT_FOUND'
                    };
                }
                
                logger.info("Returning task data", {
                    jobId: payload.jobId,
                    taskId: payload.taskId,
                    status: task.status
                });

                return {
                    success: true,
                    data: task,
                    code: 'TASK_FOUND'
                };
            }

            // Otherwise return full job data
            logger.info("Returning job data", {
                jobId: payload.jobId,
                status: job.status,
                taskCount: job.tasks.length
            });

            return {
                success: true,
                data: job,
                code: 'JOB_FOUND'
            };

        } catch (error) {
            logger.error("Error in getJobStatusTask", { 
                error: error.message,
                stack: error.stack,
                jobId: payload.jobId,
                taskId: payload.taskId
            });

            return {
                success: false,
                error: error.message,
                code: 'INTERNAL_ERROR',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            };
        }
    },
});

// Add a health check task for testing the connection
export const healthCheckTask = task({
    id: "health-check",
    maxDuration: 10000,
    run: async () => {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            status: 'healthy'
        };
    },
}); 