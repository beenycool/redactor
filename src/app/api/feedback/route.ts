import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

interface FeedbackData {
  type: 'false_positive' | 'false_negative';
  entity?: {
    entity_group: string;
    word: string;
    start: number;
    end: number;
    score: number;
  };
  customText?: string;
  comment?: string;
  timestamp: string;
  sessionId?: string;
}

// Ensure feedback directory exists
const feedbackDir = join(process.cwd(), 'feedback');
if (!existsSync(feedbackDir)) {
  mkdirSync(feedbackDir, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const feedbackData: FeedbackData = await request.json();
    
    // Validate feedback data
    if (!feedbackData.type) {
      return NextResponse.json({ error: 'Feedback type is required' }, { status: 400 });
    }
    
    if (!['false_positive', 'false_negative'].includes(feedbackData.type)) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
    }
    
    // Add timestamp if not provided
    const feedbackWithTimestamp: FeedbackData = {
      ...feedbackData,
      timestamp: feedbackData.timestamp || new Date().toISOString()
    };
    
    // Save feedback to file (in production, you might want to use a database)
    const feedbackFile = join(feedbackDir, 'feedback.log');
    const feedbackEntry = {
      ...feedbackWithTimestamp,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    };
    
    appendFileSync(feedbackFile, JSON.stringify(feedbackEntry) + '\n');
    
    // In a real application, you would:
    // 1. Store feedback in a database
    // 2. Send notifications to model training team
    // 3. Aggregate feedback for model improvement
    // 4. Implement user consent mechanisms
    
    console.log('Feedback received:', feedbackWithTimestamp);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Feedback submitted successfully' 
    });
  } catch (error: any) {
    console.error('Feedback submission error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Simple endpoint to check if feedback API is working
  return NextResponse.json({ 
    status: 'Feedback API is running',
    timestamp: new Date().toISOString()
  });
}