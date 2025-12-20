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
    detections: any[]; // OCR Detections
    onFilter: (filteredWords: any[]) => void;
}

export function ImageHighlighter({ imageUrl, detections, onFilter }: ImageHighlighterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [path, setPath] = useState<Point[]>([]);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

    // Filter Logic
    const filterWords = (currentPath: Point[]) => {
        if (!imageDimensions || currentPath.length < 3 || !containerRef.current) return;

        const container = containerRef.current;
        const { clientWidth: containerWidth, clientHeight: containerHeight } = container;
        const { width: imgNaturalWidth, height: imgNaturalHeight } = imageDimensions;

        // Calculate rendered image dimensions (contain)
        const imgAspect = imgNaturalWidth / imgNaturalHeight;
        const containerAspect = containerWidth / containerHeight;

        let renderedWidth, renderedHeight, offsetX, offsetY;

        if (containerAspect > imgAspect) {
            // Container is wider -> Pillarbox (bars on sides)
            renderedHeight = containerHeight;
            renderedWidth = containerHeight * imgAspect;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
        } else {
            // Container is taller -> Letterbox (bars top/bottom)
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / imgAspect;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
        }

        const scaleX = imgNaturalWidth / renderedWidth;
        const scaleY = imgNaturalHeight / renderedHeight;

        // Convert path points to Original Image Coordinates
        const polygon = currentPath.map(p => {
            // p is relative to container (0,0 is top-left of container)
            // We subtract the offset (start of image) and then scale.
            const x = (p.x - offsetX) * scaleX;
            const y = (p.y - offsetY) * scaleY;
            return [x, y];
        });

        const filtered = detections.filter(detection => {
            if (!detection.boundingPoly?.vertices) return false;

            const vertices = detection.boundingPoly.vertices;
            let cx = 0, cy = 0;
            vertices.forEach((v: any) => {
                cx += (v.x || 0);
                cy += (v.y || 0);
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
        // Optional: clear path after a delay? Or keep it to show selection?
        // For now, keep it.
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

        // Resize canvas to match container
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (path.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#f59e0b'; // Amber-500
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.moveTo(path[0].x, path[0].y);
            path.forEach(p => ctx.lineTo(p.x, p.y));

            // If checking "closed" loop, maybe draw line to start?
            // For now just draw the strip.

            ctx.stroke();

            // Visualize "Selection Mode" - maybe partial fill?
            ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
            ctx.fill();
        }

        // DEBUG: Draw Bounding Boxes if enabled (or always for now to solve user issue)
        // Let's draw them faintly to confirm where the app thinks text is.
        if (imageDimensions) {
            const { clientWidth: containerWidth, clientHeight: containerHeight } = containerRef.current;
            const { width: imgNaturalWidth, height: imgNaturalHeight } = imageDimensions;
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
            const scaleX = renderedWidth / imgNaturalWidth; // Inverse scale for projecting TO canvas
            const scaleY = renderedHeight / imgNaturalHeight;

            ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
            ctx.lineWidth = 1;

            detections.forEach(d => {
                if (d.boundingPoly?.vertices) {
                    ctx.beginPath();
                    const v = d.boundingPoly.vertices;
                    if (v.length > 0) {
                        ctx.moveTo((v[0].x || 0) * scaleX + offsetX, (v[0].y || 0) * scaleY + offsetY);
                        for (let i = 1; i < v.length; i++) {
                            ctx.lineTo((v[i].x || 0) * scaleX + offsetX, (v[i].y || 0) * scaleY + offsetY);
                        }
                        ctx.closePath();
                        ctx.stroke();

                        // indicate center
                        let cx = 0, cy = 0;
                        v.forEach((p: any) => { cx += (p.x || 0); cy += (p.y || 0); });
                        cx /= v.length;
                        cy /= v.length;
                        ctx.fillStyle = 'rgba(0,255,0,0.5)';
                        ctx.fillRect((cx * scaleX + offsetX) - 2, (cy * scaleY + offsetY) - 2, 4, 4);
                    }
                }
            });
        }
    }, [path, isDrawing, detections, imageDimensions]);

    // Also reset on new Image
    useEffect(() => {
        setPath([]);
    }, [imageUrl]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full touch-none select-none"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
        >
            {/* The Image */}
            <Image
                src={imageUrl}
                alt="Scan"
                fill
                className="object-contain pointer-events-none"
                onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
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
