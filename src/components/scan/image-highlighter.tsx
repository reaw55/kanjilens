"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import inside from "point-in-polygon";

interface Point {
    x: number;
    y: number;
}

interface ImageHighlighterProps {
    imageUrl: string;
    thumbnailUrl?: string | null;
    detections: any[]; // OCR Detections
    selectedWords?: any[]; // Words from lasso selection
    highlightedWord?: string | null; // Word being hovered in button list
    ocrDimensions?: { width: number; height: number };
    onFilter: (filteredWords: any[]) => void;
}

export function ImageHighlighter({ imageUrl, thumbnailUrl, detections, selectedWords = [], highlightedWord, ocrDimensions, onFilter }: ImageHighlighterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    // ... existing refs and state ...
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [path, setPath] = useState<Point[]>([]);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

    // Generic render/filter recalculation function
    const recalculate = () => {
        if (!containerRef.current || !imageDimensions) return;

        // Use getBoundingClientRect for sub-pixel precision
        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;
        const containerHeight = rect.height;

        const { width: imgNaturalWidth, height: imgNaturalHeight } = imageDimensions;

        // ROTATION DETECTION:
        // Check if OCR dimensions are swapped relative to displayed image
        let isRotated = false;
        if (ocrDimensions) {
            const imgAspect = imgNaturalWidth / imgNaturalHeight;
            const ocrAspect = ocrDimensions.width / ocrDimensions.height;
            // If one is > 1 and other is < 1, dimensions are swapped (90° rotation)
            if ((imgAspect > 1 && ocrAspect < 1) || (imgAspect < 1 && ocrAspect > 1)) {
                isRotated = true;
            }
        }

        // Calculate rendered image dimensions (object-fit: contain)
        const imgAspect = imgNaturalWidth / imgNaturalHeight;
        const containerAspect = containerWidth / containerHeight;

        let renderedWidth, renderedHeight, offsetX, offsetY;

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

        // CRITICAL FIX: When rotated, OCR dims are swapped relative to visual dims
        // OCR X (0..ocrW) maps to Visual Y (0..renderedHeight)
        // OCR Y (0..ocrH) maps to Visual X (0..renderedWidth)
        let scaleX: number, scaleY: number;
        if (isRotated && ocrDimensions) {
            // For rotated images: map OCR coords to visual space
            scaleX = renderedWidth / ocrDimensions.height;  // OCR height -> visual width
            scaleY = renderedHeight / ocrDimensions.width;  // OCR width -> visual height
        } else {
            scaleX = renderedWidth / imgNaturalWidth;
            scaleY = renderedHeight / imgNaturalHeight;
        }

        return { scaleX, scaleY, offsetX, offsetY, containerWidth, containerHeight, isRotated, ocrDimensions };
    };

    // Filter Logic
    const filterWords = (currentPath: Point[]) => {
        const metrics = recalculate();
        if (!metrics || currentPath.length < 3) return;
        const { scaleX, scaleY, offsetX, offsetY, isRotated, ocrDimensions } = metrics;

        // Convert path points to Original Image Coordinates
        const polygon = currentPath.map(p => {
            // Inverse projection: (Screen - Offset) / Scale
            const x = (p.x - offsetX) / scaleX;
            const y = (p.y - offsetY) / scaleY;
            return [x, y];
        });

        const filtered = detections.filter(detection => {
            if (!detection.boundingPoly?.vertices) return false;
            const vertices = detection.boundingPoly.vertices;
            let cx = 0, cy = 0;

            vertices.forEach((v: any, i: number) => {
                let vx = v.x || 0;
                let vy = v.y || 0;

                // TRANSFORM COORDINATES IF ROTATED
                if (isRotated && ocrDimensions) {
                    // Transpose + Horizontal Mirror to fix mirrored coordinates
                    const oldX = vx;
                    const oldY = vy;
                    // Mirror: flip X axis (ocrHeight - oldY instead of just oldY)
                    vx = ocrDimensions.height - oldY;
                    vy = oldX;

                    if (v === vertices[0] && i === 0) {
                        console.log("DEBUG ROTATION:", {
                            ocrW: ocrDimensions.width, ocrH: ocrDimensions.height,
                            imgW: metrics.containerWidth, imgH: metrics.containerHeight,
                            scaleX, scaleY,
                            oldX, oldY, newX: vx, newY: vy
                        });
                    }
                }

                cx += vx;
                cy += vy;
            });

            cx /= vertices.length;
            cy /= vertices.length;

            return inside([cx, cy], polygon);
        });

        onFilter(filtered);
    };

    // Drawing Handlers
    const startDrawing = (e: React.PointerEvent) => {
        setIsDrawing(true);
        const point = getPoint(e);
        setPath([point]);
    };

    const draw = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        const point = getPoint(e);
        setPath(prev => [...prev, point]);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        filterWords(path);
    };

    const clearSelection = () => {
        setPath([]);
        onFilter(detections); // Reset to all
    };

    const getPoint = (e: React.PointerEvent) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    // Render Logic for the Path
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !containerRef.current) return;

        // FORCE RESIZE Canvas to match container resolution (1:1 with CSS pixels)
        const rect = containerRef.current.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const renderFrame = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Path
            if (path.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.moveTo(path[0].x, path[0].y);
                path.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.stroke();
                ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
                ctx.fill();
            }

            // Draw Boxes
            const metrics = recalculate();
            if (metrics) {
                const { scaleX, scaleY, offsetX, offsetY, isRotated, ocrDimensions } = metrics;
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
                ctx.lineWidth = 1.5;

                detections.forEach(d => {
                    if (d.boundingPoly?.vertices) {
                        const v = d.boundingPoly.vertices;
                        if (v.length > 0) {
                            ctx.beginPath();

                            // Transform Helper
                            const getCoord = (p: any) => {
                                let vx = p.x || 0;
                                let vy = p.y || 0;
                                if (isRotated && ocrDimensions) {
                                    // Transpose + Horizontal Mirror
                                    const oldX = vx;
                                    const oldY = vy;
                                    vx = ocrDimensions.height - oldY;
                                    vy = oldX;
                                }
                                return {
                                    x: vx * scaleX + offsetX,
                                    y: vy * scaleY + offsetY
                                };
                            };

                            const start = getCoord(v[0]);
                            ctx.moveTo(start.x, start.y);

                            for (let i = 1; i < v.length; i++) {
                                const p = getCoord(v[i]);
                                ctx.lineTo(p.x, p.y);
                            }
                            ctx.closePath();

                            // Check if selected (lasso) or highlighted (button hover)
                            const isSelected = selectedWords?.some(w => w === d || w.description === d.description);
                            // Check if this word matches or contains the highlighted word from button
                            const isHighlighted = highlightedWord && (
                                d.description === highlightedWord ||
                                d.description.includes(highlightedWord) ||
                                highlightedWord.includes(d.description)
                            );

                            if (isHighlighted) {
                                // Highlighted from button: Light yellow fill
                                ctx.strokeStyle = '#f59e0b'; // Amber
                                ctx.lineWidth = 3;
                                ctx.stroke();
                                ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
                                ctx.fill();
                            } else if (isSelected) {
                                // Selected from lasso: Yellow outline
                                ctx.strokeStyle = '#ffbf51ff'; // yellow
                                ctx.lineWidth = 3;
                                ctx.stroke();
                            } else {
                                // Unselected: Light yellow outline only (no fill)
                                ctx.strokeStyle = '#f5d49bff'; // light yellow
                                ctx.lineWidth = 1;
                                ctx.stroke();
                            }
                        }
                    }
                });
            }
        };

        renderFrame();

        // Resize Observer to handle layout shifts
        const resizeObserver = new ResizeObserver(() => {
            const newRect = containerRef.current?.getBoundingClientRect();
            if (newRect && canvas) {
                canvas.width = newRect.width;
                canvas.height = newRect.height;
                renderFrame();
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();

    }, [path, detections, imageDimensions]);

    // Also reset on new Image
    useEffect(() => {
        setPath([]);
    }, [imageUrl]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full touch-none select-none bg-black"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
        >
            {/* Low-Res Thumbnail (Immediate) */}
            {thumbnailUrl && (
                <img
                    src={thumbnailUrl}
                    alt="Thumbnail"
                    className="absolute inset-0 w-full h-full object-contain blur-sm scale-105 opacity-50 pointer-events-none"
                />
            )}

            {/* The Image (Lazy High-Res) */}
            <Image
                src={imageUrl}
                alt="Scan"
                fill
                className="object-contain pointer-events-none transition-opacity duration-500 opacity-0 data-[loaded=true]:opacity-100"
                onLoadingComplete={(img) => img.classList.add("data-[loaded=true]:opacity-100")}
                onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.classList.remove("opacity-0");
                    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                }}
            />

            {/* The Drawing Canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
            />

            {/* Helper Hint or Reset Button overlay */}
            {path.length > 0 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent drawing
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
