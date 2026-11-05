"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadCapture } from "@/actions/capture";

type Point = { x: number; y: number };

const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.9;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/**
 * Draw `source` (a region of it, optionally clipped to lasso paths) onto a canvas no larger
 * than MAX_EDGE and export it as JPEG. Browsers apply EXIF orientation when drawing an <img>,
 * so the result is upright, and canvas output carries no EXIF/GPS metadata.
 */
async function renderJpeg(
    source: HTMLImageElement,
    region: { x: number; y: number; width: number; height: number },
    clipPaths?: Point[][]
): Promise<Blob | null> {
    const scale = Math.min(1, MAX_EDGE / Math.max(region.width, region.height));
    const width = Math.max(1, Math.round(region.width * scale));
    const height = Math.max(1, Math.round(region.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scale, scale);

    if (clipPaths && clipPaths.length > 0) {
        ctx.beginPath();
        clipPaths.forEach((path) => {
            if (path.length < 3) return;
            ctx.moveTo(path[0].x - region.x, path[0].y - region.y);
            for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x - region.x, path[i].y - region.y);
            ctx.closePath();
        });
        ctx.clip();
    }

    ctx.drawImage(source, -region.x, -region.y);
    return canvasToJpeg(canvas);
}

export function CameraCapture() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [preview, setPreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    // Lasso strokes in display (container) coordinates.
    const [allPaths, setAllPaths] = useState<Point[][]>([]);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };

    const resetSelection = () => {
        setAllPaths([]);
        setCurrentPath([]);
        clearCanvas();
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (preview) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(file));
        setError(null);
        resetSelection();
    };

    const retake = () => {
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        setError(null);
        resetSelection();
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const pointFrom = (e: React.PointerEvent): Point | null => {
        if (!containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const startStroke = (e: React.PointerEvent) => {
        const p = pointFrom(e);
        const ctx = canvasRef.current?.getContext("2d");
        if (!p || !ctx) return;
        setIsDrawing(true);
        setCurrentPath([p]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    };

    const extendStroke = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        const p = pointFrom(e);
        const ctx = canvasRef.current?.getContext("2d");
        if (!p || !ctx) return;
        setCurrentPath((prev) => [...prev, p]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    };

    const endStroke = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        if (currentPath.length > 2) setAllPaths((prev) => [...prev, currentPath]);
        setCurrentPath([]);
    };

    /** Convert lasso strokes from display coordinates to the image's natural pixel coordinates. */
    const toNaturalPaths = (img: HTMLImageElement, paths: Point[][]) => {
        const { naturalWidth, naturalHeight, width: displayWidth, height: displayHeight } = img;
        const imgAspect = naturalWidth / naturalHeight;
        const displayAspect = displayWidth / displayHeight;

        let renderedWidth: number, offsetX: number, offsetY: number;
        if (displayAspect > imgAspect) {
            renderedWidth = displayHeight * imgAspect;
            offsetX = (displayWidth - renderedWidth) / 2;
            offsetY = 0;
        } else {
            renderedWidth = displayWidth;
            offsetX = 0;
            offsetY = (displayHeight - displayWidth / imgAspect) / 2;
        }
        const scale = naturalWidth / renderedWidth;
        return paths.map((path) => path.map((p) => ({ x: (p.x - offsetX) * scale, y: (p.y - offsetY) * scale })));
    };

    const buildUploadBlob = async (): Promise<Blob | null> => {
        const img = imageRef.current;
        if (!img || !img.complete || img.naturalWidth === 0) return null;
        const full = { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };

        if (allPaths.length === 0) {
            return renderJpeg(img, full);
        }

        // Crop to the union of the lasso shapes (plus padding) and mask everything else white,
        // so OCR only sees the circled text.
        const paths = toNaturalPaths(img, allPaths);
        const padding = 20 * (img.naturalWidth / img.width);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        paths.flat().forEach((p) => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(img.naturalWidth, maxX + padding);
        maxY = Math.min(img.naturalHeight, maxY + padding);
        if (maxX <= minX || maxY <= minY) return renderJpeg(img, full);

        return renderJpeg(img, { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, paths);
    };

    const handleUpload = async () => {
        setError(null);
        setIsUploading(true);
        try {
            const blob = await buildUploadBlob();
            if (!blob) {
                setError("Couldn't read this image. Try a JPEG or PNG photo.");
                return;
            }
            if (blob.size > MAX_UPLOAD_BYTES) {
                setError("Image is too large (max 10 MB).");
                return;
            }

            const formData = new FormData();
            formData.append("file", blob, "scan.jpg");
            const result = await uploadCapture(formData);

            if ("error" in result) {
                setError(result.error);
                return;
            }
            router.push(`/scan/${result.captureId}`);
        } catch (e) {
            console.error("Upload failed", e);
            setError("Upload failed. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-4 pb-8">
            <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
            />

            {!preview ? (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-[4/5] bg-zinc-800 rounded-3xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800/80 transition-all group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="h-20 w-20 rounded-full bg-zinc-900 flex items-center justify-center mb-4 ring-1 ring-zinc-700 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-rounded text-4xl text-amber-500">photo_camera</span>
                    </div>
                    <span className="text-zinc-400 font-medium">Tap to Scan Kanji</span>
                    <span className="text-xs text-zinc-600 mt-2">Supports Camera & Gallery</span>
                </button>
            ) : (
                <div className="space-y-6">
                    <div
                        ref={containerRef}
                        className="relative aspect-[3/4] max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 touch-none select-none bg-zinc-950"
                        onPointerDown={startStroke}
                        onPointerMove={extendStroke}
                        onPointerUp={endStroke}
                        onPointerLeave={endStroke}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                        <img
                            ref={imageRef}
                            src={preview}
                            alt="Preview"
                            className="absolute inset-0 w-full h-full object-contain img-optimized pointer-events-none"
                            onLoad={() => {
                                if (canvasRef.current && containerRef.current) {
                                    canvasRef.current.width = containerRef.current.clientWidth;
                                    canvasRef.current.height = containerRef.current.clientHeight;
                                }
                            }}
                        />
                        <canvas ref={canvasRef} className="absolute inset-0 z-10" />

                        {allPaths.length > 0 ? (
                            <div className="absolute top-4 right-4 z-20">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetSelection();
                                    }}
                                >
                                    Reset Selection
                                </Button>
                            </div>
                        ) : (
                            <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-amber-500/80 pointer-events-none">
                                Draw to circle Kanji (optional)
                            </div>
                        )}
                    </div>

                    {error && (
                        <div role="alert" className="p-3 text-sm text-red-400 bg-red-500/10 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            onClick={retake}
                            className="h-12 rounded-xl border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                            disabled={isUploading}
                        >
                            Retake
                        </Button>
                        <Button
                            onClick={handleUpload}
                            className="h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20"
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <>
                                    <span className="material-symbols-rounded animate-spin mr-1">progress_activity</span>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-rounded mr-1">upload</span>
                                    Analyze
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
