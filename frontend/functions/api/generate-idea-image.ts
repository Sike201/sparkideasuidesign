// File: functions/api/generate-idea-image.ts
// API to generate idea images using DALL-E

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  R2: R2Bucket;
  OPENAI_API_KEY?: string;
  VITE_ENVIRONMENT_TYPE: string;
  PUBLIC_R2_URL?: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  if (method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        ...corsHeaders(request),
        Allow: "OPTIONS, POST",
      },
    });
  }

  return handlePostRequest(context);
};

// POST - Generate image for an idea using DALL-E
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      ideaId?: string;
      title?: string;
      description?: string;
      category?: string;
      problem?: string;
      solution?: string;
    };

    const { ideaId, title, description, category, problem, solution } = body;

    console.log("🖼️ [IMAGE GENERATION] Starting image generation", {
      ideaId,
      title,
      category,
      hasProblem: !!problem,
      hasSolution: !!solution,
      hasDescription: !!description,
      hasOpenAIKey: !!ctx.env.OPENAI_API_KEY,
      hasR2: !!ctx.env.R2,
      publicR2Url: ctx.env.PUBLIC_R2_URL,
    });

    if (!ideaId || !title) {
      return jsonResponse({ message: "ideaId and title are required" }, 400);
    }

    // Extract problem and solution from description if not provided
    let extractedProblem = problem;
    let extractedSolution = solution;
    
    if (!extractedProblem || !extractedSolution) {
      const problemMatch = description?.match(/\*\*Problem:\*\*\s*\n?([^*]+?)(?=\*\*|$)/i);
      const solutionMatch = description?.match(/\*\*Solution:\*\*\s*\n?([^*]+?)(?=\*\*|$)/i);
      
      if (!extractedProblem && problemMatch) {
        extractedProblem = problemMatch[1].trim();
      }
      if (!extractedSolution && solutionMatch) {
        extractedSolution = solutionMatch[1].trim();
      }
    }

    // Use OpenAI for prompt generation
    if (!ctx.env.OPENAI_API_KEY) {
      return jsonResponse({ message: "OPENAI_API_KEY not configured" }, 500);
    }

    // Check if image already exists
    const existingIdea = await db
      .prepare("SELECT json_extract(data, '$.generated_image_url') as generated_image_url FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ generated_image_url?: string }>();

    if (existingIdea?.generated_image_url) {
      console.log("✅ [IMAGE GENERATION] Using cached image:", existingIdea.generated_image_url);
      return jsonResponse({
        success: true,
        imageUrl: existingIdea.generated_image_url,
        cached: true,
      }, 200);
    }

    // Check if image generation is already in progress (within last 60 seconds)
    // This prevents duplicate concurrent requests
    const recentCheck = await db
      .prepare("SELECT json_extract(data, '$.generated_image_url') as generated_image_url, json_extract(data, '$.updated_at') as updated_at FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ generated_image_url?: string; updated_at?: string }>();
    
    if (recentCheck?.updated_at && !recentCheck.generated_image_url) {
      const updatedAt = new Date(recentCheck.updated_at).getTime();
      const now = Date.now();
      const timeSinceUpdate = now - updatedAt;
      
      // If updated within last 60 seconds and no image yet, likely generation in progress
      if (timeSinceUpdate < 60000) {
        console.log("⏳ [IMAGE GENERATION] Image generation likely in progress (updated", Math.round(timeSinceUpdate / 1000), "seconds ago), skipping duplicate request");
        return jsonResponse({
          success: true,
          imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${ideaId}&backgroundColor=1a1a1a&shape1Color=ff6b35&shape2Color=10b981&shape3Color=10b981`,
          cached: false,
          inProgress: true,
        }, 200);
      }
    }

    console.log("🔄 [IMAGE GENERATION] No cached image found, generating new one...");
    
    // Mark that we're starting generation by updating the idea (this helps prevent concurrent requests)
    await db
      .prepare("UPDATE ideas SET data = json_set(data, '$.updated_at', datetime('now')) WHERE id = ?")
      .bind(ideaId)
      .run();

    // Generate image prompt using AI
    const systemPrompt = `You are a creative image prompt generator. Analyze the idea and create a UNIQUE, SPECIFIC visual concept.

## CRITICAL RULES

1. NEVER use these overused objects: balance scale, magnifying glass, lightbulb, gear, compass, key, lock
2. The image must directly relate to the SPECIFIC functionality or domain of the idea
3. Be creative and unexpected - think about what makes THIS idea unique
4. Consider the actual technology, industry, or action involved

## How to choose the right object

- For DeFi/staking ideas: Think about flow, accumulation, growth → water droplets forming a river, seeds sprouting, a piggy bank overflowing with coins
- For automation/bots: Think about the specific action → a hand planting seeds (for auto-investing), a clock with flowing sand (for scheduled actions)
- For data/analytics: Think about visualization → a prism splitting light, a telescope, binoculars
- For social/community: Think about connection → interlinked chains, a bridge, two hands shaking
- For gaming: The specific game element → a controller, a trophy, specific game piece
- For identity: A passport, a wax seal, a fingerprint scanner
- For speed/efficiency: A rocket, a lightning bolt, a cheetah

## IMPORTANT

Read the title and solution carefully. If someone says "stake SOL and DCA into assets", think about:
- What is the core action? → Converting yield into purchases
- What visual represents that? → A fountain where water (yield) transforms into coins, or a tree bearing fruit (passive income growing)

## Output Format

Return ONLY the image prompt (nothing else):

Single isolated object, stipple engraving illustration of a [YOUR CREATIVE SPECIFIC OBJECT with 2-3 descriptive details], vintage etching style with halftone dot pattern, duotone black and orange (#F97316), high contrast, clean white background, centered composition, no text, no labels, detailed crosshatching technique`;

    const userPrompt = `IDEA TITLE: "${title}"
CATEGORY: ${category || "General"}
PROBLEM IT SOLVES: ${extractedProblem || "Not specified"}
HOW IT WORKS: ${extractedSolution || description?.substring(0, 300) || "Not specified"}

Think about the KEY ACTION or UNIQUE MECHANISM of this idea. What physical object or scene would a user immediately associate with this specific functionality? Be creative and specific to THIS idea.`;

    console.log("📝 [IMAGE GENERATION] User prompt for image prompt generation:", {
      title,
      category,
      problem: extractedProblem?.substring(0, 100),
      solution: extractedSolution?.substring(0, 100),
    });

    let imagePrompt: string;

    // Generate image prompt using OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ctx.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.9,
        max_tokens: 250,
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    imagePrompt = openaiData.choices?.[0]?.message?.content?.trim() || "";

    // Clean up the prompt (remove markdown code blocks if present)
    imagePrompt = imagePrompt.replace(/```[\w]*\n?/g, '').trim();

    console.log("🎨 [IMAGE GENERATION] Generated image prompt:", imagePrompt.substring(0, 200));

    // Generate image using DALL-E
    let imageUrl: string;
    
    if (ctx.env.OPENAI_API_KEY) {
      try {
        const dallEResponse = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ctx.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: imagePrompt,
            size: "1024x1024",
            quality: "standard",
            n: 1,
          }),
        });

        if (dallEResponse.ok) {
          const dallEData = await dallEResponse.json() as {
            data?: Array<{ url?: string }>;
          };
          const generatedImageUrl = dallEData.data?.[0]?.url;
          
          if (generatedImageUrl) {
            console.log("📥 [IMAGE GENERATION] Downloading DALL-E image from:", generatedImageUrl);

            // Try to compress via Cloudflare Image Resizing (converts to JPEG, resizes to OG dimensions)
            let imageBytes: Uint8Array;
            let contentType = "image/png";
            let fileExt = "png";

            try {
              const compressedResponse = await fetch(generatedImageUrl, {
                cf: {
                  image: {
                    width: 1024,
                    height: 1024,
                    fit: "cover",
                    format: "jpeg",
                    quality: 80,
                  },
                },
              } as RequestInit);

              if (compressedResponse.ok && compressedResponse.headers.get("content-type")?.includes("jpeg")) {
                imageBytes = new Uint8Array(await compressedResponse.arrayBuffer());
                contentType = "image/jpeg";
                fileExt = "jpg";
                console.log("✅ [IMAGE GENERATION] Compressed via Image Resizing:", imageBytes.length, "bytes");
              } else {
                throw new Error("Image Resizing did not return JPEG");
              }
            } catch (compressionError) {
              console.log("⚠️ [IMAGE GENERATION] Image Resizing unavailable, using original PNG");
              const imageDownloadResponse = await fetch(generatedImageUrl);
              if (!imageDownloadResponse.ok) throw new Error("Failed to download DALL-E image");
              imageBytes = new Uint8Array(await imageDownloadResponse.arrayBuffer());
            }

            if (imageBytes.length > 0) {
              console.log("📤 [IMAGE GENERATION] Uploading image to R2, size:", imageBytes.length, "format:", contentType);

              const fileName = `ideas/${ideaId}-${Date.now()}.${fileExt}`;
              console.log("📁 [IMAGE GENERATION] R2 upload details:", {
                fileName,
                bucket: "sparkit-r2-staging",
                hasR2: !!ctx.env.R2,
                publicR2Url: ctx.env.PUBLIC_R2_URL,
              });
              
              // Check if R2 is available before attempting upload
              if (!ctx.env.R2) {
                console.warn("⚠️ [IMAGE GENERATION] R2 binding not available, using DALL-E URL directly");
                imageUrl = generatedImageUrl;
              } else {
                try {
                  const putResult = await ctx.env.R2.put(fileName, imageBytes, {
                  httpMetadata: {
                    contentType,
                    cacheControl: "public, max-age=31536000",
                  },
                  customMetadata: {
                    ideaId: ideaId,
                    prompt: imagePrompt.substring(0, 200),
                  },
                });

                console.log("✅ [IMAGE GENERATION] R2 put operation completed:", {
                  fileName,
                  etag: putResult?.etag,
                  uploaded: putResult?.size === imageBytes.length,
                });

                // Verify the file exists by trying to get it
                try {
                  const verifyGet = await ctx.env.R2.get(fileName);
                  if (verifyGet) {
                    console.log("✅ [IMAGE GENERATION] Verified file exists in R2:", {
                      fileName,
                      size: verifyGet.size,
                      contentType: verifyGet.httpMetadata?.contentType,
                    });
                  } else {
                    console.error("❌ [IMAGE GENERATION] File not found in R2 after upload!");
                  }
                } catch (verifyError) {
                  console.error("❌ [IMAGE GENERATION] Failed to verify file in R2:", verifyError);
                }

                const publicR2BaseUrl = ctx.env.PUBLIC_R2_URL || 'https://pub-2f8545bed3614a77bada1b1047697442.r2.dev';
                const r2ImageUrl = `${publicR2BaseUrl}/${fileName}`;
                console.log("✅ [IMAGE GENERATION] DALL-E image uploaded to R2, URL:", r2ImageUrl);
                console.log("🔗 [IMAGE GENERATION] Full URL breakdown:", {
                  baseUrl: publicR2BaseUrl,
                  fileName,
                  fullUrl: r2ImageUrl,
                });

                // Test if the URL is accessible
                let r2UrlAccessible = false;
                try {
                  console.log("🧪 [IMAGE GENERATION] Testing public R2 URL accessibility...");
                  const testResponse = await fetch(r2ImageUrl, { method: 'HEAD' });
                  if (testResponse.ok) {
                    console.log("✅ [IMAGE GENERATION] Public R2 URL is accessible! Status:", testResponse.status);
                    r2UrlAccessible = true;
                    imageUrl = r2ImageUrl;
                  } else {
                    console.error("❌ [IMAGE GENERATION] Public R2 URL returned error:", {
                      status: testResponse.status,
                      statusText: testResponse.statusText,
                      url: r2ImageUrl,
                    });
                    // Fallback to DALL-E URL if R2 URL is not accessible
                    console.log("🔄 [IMAGE GENERATION] R2 URL not accessible, falling back to DALL-E URL");
                    imageUrl = generatedImageUrl;
                  }
                } catch (testError) {
                  console.error("❌ [IMAGE GENERATION] Failed to test public R2 URL:", testError);
                  // Fallback to DALL-E URL if test fails
                  console.log("🔄 [IMAGE GENERATION] R2 URL test failed, falling back to DALL-E URL");
                  imageUrl = generatedImageUrl;
                }
              } catch (r2Error) {
                console.error("❌ [IMAGE GENERATION] R2 upload failed:", r2Error);
                // Fallback to DALL-E URL if R2 upload fails
                console.log("🔄 [IMAGE GENERATION] Falling back to DALL-E URL due to R2 upload failure");
                imageUrl = generatedImageUrl;
              }
            }
            }
          } else {
            throw new Error("No image URL from DALL-E");
          }
        } else {
          const errorText = await dallEResponse.text();
          console.error("❌ [IMAGE GENERATION] DALL-E API error:", dallEResponse.status, errorText.substring(0, 500));
          throw new Error("DALL-E API error");
        }
      } catch (error) {
        console.error("DALL-E generation failed:", error);
        imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${ideaId}&backgroundColor=1a1a1a&shape1Color=ff6b35&shape2Color=10b981&shape3Color=10b981`;
      }
    } else {
      // No API keys, use placeholder
      imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${ideaId}&backgroundColor=1a1a1a&shape1Color=ff6b35&shape2Color=10b981&shape3Color=10b981`;
    }

    // Store image URL in database
    console.log("💾 [IMAGE GENERATION] Storing image URL in database:", {
      ideaId,
      imageUrl,
    });

    await db
      .prepare("UPDATE ideas SET data = json_set(data, '$.generated_image_url', ?) WHERE id = ?")
      .bind(imageUrl, ideaId)
      .run();

    console.log("✅ [IMAGE GENERATION] Image generation complete, returning URL:", imageUrl);

    return jsonResponse({
      success: true,
      imageUrl,
      cached: false,
    }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong generating image..." }, 500);
  }
}
