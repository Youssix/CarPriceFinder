// Vehicle routes: CRUD + image upload
const express = require('express');
const router = express.Router();
const { Catbox } = require('node-catbox');
const { getSavedVehicles, saveVehicle, deleteSavedVehicle } = require('../db');
const { apiKeyAuth, rateLimiter } = require('../lib/middleware');

router.use('/api/vehicles', rateLimiter);

// GET /api/vehicles - Get user's saved vehicles
router.get('/api/vehicles', apiKeyAuth, async (req, res) => {
    try {
        const vehicles = await getSavedVehicles(req.subscriber.id);
        res.json({ ok: true, vehicles });
    } catch (err) {
        console.error('[🚗 Vehicles] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch vehicles' });
    }
});

// POST /api/vehicles - Save a vehicle
router.post('/api/vehicles', apiKeyAuth, async (req, res) => {
    try {
        const vehicle = await saveVehicle(req.subscriber.id, req.body);
        res.json({ ok: true, vehicle });
    } catch (err) {
        console.error('[🚗 Vehicles] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to save vehicle' });
    }
});

// DELETE /api/vehicles/:stockNumber - Delete a saved vehicle
router.delete('/api/vehicles/:stockNumber', apiKeyAuth, async (req, res) => {
    try {
        const deleted = await deleteSavedVehicle(req.subscriber.id, req.params.stockNumber);
        res.json({ ok: true, deleted });
    } catch (err) {
        console.error('[🚗 Vehicles] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to delete vehicle' });
    }
});

// POST /api/upload-images - Upload photos using node-catbox
router.post('/api/upload-images', apiKeyAuth, express.json(), async (req, res) => {
    const { imageUrls, title } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ ok: false, error: "imageUrls array required" });
    }

    try {
        console.log(`📤 Uploading ${imageUrls.length} images using node-catbox...`);

        const uploadedImages = [];
        const catbox = new Catbox();

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            console.log(`📸 Uploading image ${i + 1}/${imageUrls.length}...`);

            try {
                const catboxUrl = await catbox.uploadURL({ url: imageUrl });

                if (catboxUrl && catboxUrl.startsWith('https://files.catbox.moe/')) {
                    uploadedImages.push({
                        link: catboxUrl,
                        thumb: catboxUrl,
                        index: i + 1
                    });
                    console.log(`✅ Image ${i + 1} uploaded: ${catboxUrl}`);
                } else {
                    console.error(`❌ Image ${i + 1} upload failed: Invalid response`);
                    console.error(`📍 Failed URL:`, imageUrl);
                }
            } catch (error) {
                console.error(`❌ Image ${i + 1} upload error:`, error.message);
            }

            // Small delay between uploads (200ms)
            if (i < imageUrls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        if (uploadedImages.length === 0) {
            return res.status(500).json({ ok: false, error: "No images uploaded successfully" });
        }

        const albumText = uploadedImages.map(img => img.link).join('\n');

        console.log(`✅ Upload complete: ${uploadedImages.length}/${imageUrls.length} images`);

        return res.json({
            ok: true,
            albumUrl: albumText,
            images: uploadedImages,
            totalImages: uploadedImages.length,
            note: uploadedImages.length < imageUrls.length ? `Only ${uploadedImages.length}/${imageUrls.length} uploaded` : undefined
        });

    } catch (error) {
        console.error('❌ Catbox upload error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
