import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the Gemini API client
// Ensure GEMINI_API_KEY is set in your .env file
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyzes an image of a construction element to determine its condition and accessibility.
 * @param {Buffer} imageBuffer - The image file buffer.
 * @param {string} mimeType - The mime type of the image (e.g., 'image/jpeg', 'image/png').
 * @param {string} elementDescription - Description of the element to help the AI.
 * @returns {Promise<{condition: string, accessibility: string}>}
 */
export const assessElementImage = async (imageBuffer, mimeType, elementDescription) => {
  try {
    const prompt = `
    You are an expert construction AI assistant. Analyze the provided image of the construction element: "${elementDescription}".
    
    Determine two things based on visual evidence:
    1. Condition (الحالة): Is it 'جيدة' (Good), 'متوسطة' (Fair), or 'تالفة' (Damaged)?
    2. Accessibility (إمكانية الوصول): Is it 'سهل' (Easy to reach/dismantle), 'متوسط' (Moderate), or 'يتعذر' (Inaccessible without demolition)?
    
    Respond STRICTLY with a valid JSON object in this exact format, with no markdown formatting or extra text:
    {
      "condition": "جيدة|متوسطة|تالفة",
      "accessibility": "سهل|متوسط|يتعذر"
    }
    `;

    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: mimeType
        }
      }
    ]);

    const jsonText = result.response.text();
    const parsedData = JSON.parse(jsonText);

    // Validate the response
    const validConditions = ['جيدة', 'متوسطة', 'تالفة'];
    const validAccessibilities = ['سهل', 'متوسط', 'يتعذر'];

    return {
      condition: validConditions.includes(parsedData.condition) ? parsedData.condition : 'متوسطة',
      accessibility: validAccessibilities.includes(parsedData.accessibility) ? parsedData.accessibility : 'متوسط'
    };

  } catch (error) {
    console.error('Error in AI assessment:', error);
    // Fallback defaults if AI fails
    return { condition: 'متوسطة', accessibility: 'متوسط' };
  }
};

/**
 * Generates a final demolition strategy text using AI.
 * @param {Array} analyzedMaterials - List of analyzed materials
 * @param {Object} project - The project details
 * @returns {Promise<string|null>} - The AI recommendation
 */
export const generateAIStrategyRecommendation = async (analyzedMaterials, project) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return null;
    }
    const prompt = `
    أنت خبير في الاقتصاد الدائري والهدم الانتقائي للمباني في مصر.
    قم بصياغة توصية نهائية وخطوات مرتبة ومتسلسلة لعملية الهدم والتفكيك بناءً على قائمة العناصر التالية التي تم تحليلها للمشروع "${project.name}":
    
    العناصر:
    ${analyzedMaterials.map(m => `- ${m.name}: الكمية: ${m.quantity} ${m.unit} | التوصية: ${m.recommendedPath} (${m.priority})`).join('\n')}
    
    سياق المشروع:
    - هل توجد مواد خطرة؟ ${project.hasHazardousMaterials ? 'نعم' : 'لا'}
    - قريب من مياه جوفية أو تربة غير مستقرة؟ ${project.nearGroundwaterOrUnstableSoil ? 'نعم' : 'لا'}
    - المسافة إلى الجيران: ${project.distanceToNeighbors || 'غير محدد'}
    - منطقة ذات كثافة سكانية وحساسة للتلوث؟ ${project.isDensePollutionSensitiveArea ? 'نعم' : 'لا'}
    
    اكتب تقريراً منسقاً باللغة العربية يحتوي على:
    1. ملخص تنفيذي لجدوى التفكيك واسترجاع المواد.
    2. الترتيب الزمني المقترح لعمليات التفكيك والهدم (على سبيل المثال: إزالة المواد الخطرة أولاً، ثم التفكيك اليدوي للعناصر سهلة الوصول، ثم الهدم الميكانيكي للبنية الإنشائية).
    3. توصيات للأمان والبيئة بناءً على جيران المشروع والمياه الجوفية.
    
    اجعل التوصيات عملية ومحددة ومناسبة للسياق المصري.
    `;

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error generating AI strategy:', error);
    return null;
  }
};

