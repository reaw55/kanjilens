"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import inside from "point-in-polygon";

interface Point {
    x: number;
    y: number;
}

export type Detection = {
    description: string;
    boundingPoly?: { vertices?: { x?: number; y?: number }[] };
};

interface ImageHighlighterProps {
    imageUrl: string;
    detections: Detection[];
    selectedWords?: Detection[]; // Words inside the lasso selection
    highlightedWord?: string | null; // Word being hovered in the chip list
    ocrDimensions?: { width: number; height: number };
    onFilter: (filteredWords: Detection[]) => void;
}

export function ImageHighlighter({
    imageUrl,
    detections,
    selectedWords = [],
    highlightedWord,
    ocrDimensions,
    onFilter,
}: ImageHighlighterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [path, setPath] = useState<Point[]>([]);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Map OCR coordinates onto the rendered (object-fit: contain) image.
    const recalculate = useCallback(() => {
        if (!containerRef.current || !imageDimensions) return null;

        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;
        const containerHeight = rect.height;
        const { width: imgNaturalWidth, height: imgNaturalHeight } = imageDimensions;

        // If the OCR page is rotated 90° relative to the displayed image (older captures that
        // relied on EXIF orientation), the axes are swapped.
        let isRotated = false;
        if (ocrDimensions) {
            const imgAspect = imgNaturalWidth / imgNaturalHeight;
            const ocrAspect = ocrDimensions.width / ocrDimensions.height;
            if ((imgAspect > 1 && ocrAspect < 1) || (imgAspect < 1 && ocrAspect > 1)) {
                isRotated = true;
            }
        }

        const imgAspect = imgNaturalWidth / imgNaturalHeight;
        const containerAspect = containerWidth / containerHeight;

        let renderedWidth: number, renderedHeight: number, offsetX: number, offsetY: number;
        if (containerAspect > imgAspect) {
            renderedHeight = containerHeight;
            renderedWidth = containerHeight * imgAspect;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
        } else {
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / imgAspect;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
        }

        let scaleX: number, scaleY: number;
        if (isRotated && ocrDimensions) {
            scaleX = renderedWidth / ocrDimensions.height;
            scaleY = renderedHeight / ocrDimensions.width;
        } else {
            scaleX = renderedWidth / imgNaturalWidth;
            scaleY = renderedHeight / imgNaturalHeight;
        }

        return { scaleX, scaleY, offsetX, offsetY, isRotated };
    }, [imageDimensions, ocrDimensions]);

    const toVisual = useCallback(
        (v: { x?: number; y?: number }, isRotated: boolean) => {
            let vx = v.x || 0;
            let vy = v.y || 0;
            if (isRotated && ocrDimensions) {
                // Transpose + horizontal mirror.
                const oldX = vx;
                vx = ocrDimensions.height - vy;
                vy = oldX;
            }
            return { vx, vy };
        },
        [ocrDimensions]
    );

    const filterWords = (currentPath: Point[]) => {
        const metrics = recalculate();
        if (!metrics || currentPath.length < 3) return;
        const { scaleX, scaleY, offsetX, offsetY, isRotated } = metrics;

        // Lasso polygon in OCR (image) coordinates.
        const polygon = currentPath.map((p) => [(p.x - offsetX) / scaleX, (p.y - offsetY) / scaleY]);

        const filtered = detections.filter((detection) => {
            const vertices = detection.boundingPoly?.vertices;
            if (!vertices || vertices.length === 0) return false;
            let cx = 0;
            let cy = 0;
            vertices.forEach((v) => {
                const { vx, vy } = toVisual(v, isRotated);
                cx += vx;
                cy += vy;
            });
            return inside([cx / vertices.length, cy / vertices.length], polygon);
        });

        onFilter(filtered);
    };

    const getPoint = (e: React.PointerEvent) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const startDrawing = (e: React.PointerEvent) => {
        setIsDrawing(true);
        setPath([getPoint(e)]);
    };

    const draw = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        const point = getPoint(e);
        setPath((prev) => [...prev, point]);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        filterWords(path);
    };

    const clearSelection = () => {
        setPath([]);
        onFilter(detections);
    };

    // Paint the lasso path and OCR boxes.
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const renderFrame = () => {
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (path.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = "#f59e0b";
                ctx.lineWidth = 4;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.moveTo(path[0].x, path[0].y);
                path.forEach((p) => ctx.lineTo(p.x, p.y));
                ctx.stroke();
                ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
                ctx.fill();
            }

            const metrics = recalculate();
            if (!metrics) return;
            const { scaleX, scaleY, offsetX, offsetY, isRotated } = metrics;

            detections.forEach((d) => {
                const v = d.boundingPoly?.vertices;
                if (!v || v.length === 0) return;

                const project = (p: { x?: number; y?: number }) => {
                    const { vx, vy } = toVisual(p, isRotated);
                    return { x: vx * scaleX + offsetX, y: vy * scaleY + offsetY };
                };

                ctx.beginPath();
                const start = project(v[0]);
                ctx.moveTo(start.x, start.y);
                for (let i = 1; i < v.length; i++) {
                    const p = project(v[i]);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.closePath();

                const isSelected = selectedWords.some((w) => w === d || w.description === d.description);
                const isHighlighted =
                    !!highlightedWord &&
                    (d.description === highlightedWord ||
                        d.description.includes(highlightedWord) ||
                        highlightedWord.includes(d.description));

                if (isHighlighted) {
                    ctx.strokeStyle = "#f59e0b";
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
                    ctx.fill();
                } else if (isSelected) {
                    ctx.strokeStyle = "#ffbf51";
                    ctx.lineWidth = 3;
                    ctx.stroke();
                } else {
                    ctx.strokeStyle = "#f5d49b";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });
        };

        renderFrame();

        const resizeObserver = new ResizeObserver(renderFrame);
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [path, detections, selectedWords, highlightedWord, recalculate, toVisual]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full touch-none select-none bg-black"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by an authenticated route, not optimizable */}
            <img
                src={imageUrl}
                alt="Scanned photo"
                className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
                onLoad={(e) => {
                    const img = e.currentTarget;
                    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                    setLoaded(true);
                }}
            />

            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

            {path.length > 0 && (
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        clearSelection();
                    }}
                    className="absolute top-4 right-4 bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-md pointer-events-auto z-20"
                >
                    Clear Selection
                </button>
            )}
        </div>
    );
}
