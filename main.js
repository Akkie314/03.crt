import * as THREE from 'three';

// 定数定義
const CHAR_DISPLAY_INTERVAL = 100; // 文字表示間隔(ms)
const LINE_BREAK_WAIT_TIME = 500; // 改行待機時間(ms)

const DISTORTION_STRENGTH = 0.2; // シェーダー歪み強度
const ZOOM_FACTOR = 1.1; // ズーム係数

const MIN_FONT_SIZE = 16; // 最小フォントサイズ(px)
const MAX_FONT_SIZE = 20; // 最大フォントサイズ(px)
const FONT_PADDING = 40; // 文字パディング(px)
const FONT_WIDTH_RATIO = 0.6; // 文字幅比率
const LINE_HEIGHT_RATIO = 1.2; // 行の高さ比率

const SCAN_LINE_SPEED = 2000; // 走査線速度
const SCAN_LINE_DENSITY = 100; // 走査線密度

const FLICKER_MIN = 0.9; // ちらつき最小値
const FLICKER_MAX = 1.1; // ちらつき最大値

// 優先フォント（Google Fonts で Roboto を読み込んでいる前提）
const PREFERRED_FONT_FAMILY = "'JetBrains Mono', monospace";

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.querySelector("canvas[crt]");
    const ctx = canvas.getContext("2d");
    const targetCanvas = document.getElementById("target");
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ canvas: targetCanvas });
    
    let scanLineOffset = 0;
    let texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            screenTexture: { value: texture },
            strength: { value: DISTORTION_STRENGTH },
            zoom: { value: ZOOM_FACTOR },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
uniform sampler2D screenTexture;
uniform float strength;
uniform float zoom;
uniform vec2 resolution;
varying vec2 vUv;

void main() {
    vec2 uv = vUv;

    float aspect = resolution.x / resolution.y;
    vec2 normalizedCoord = (uv - 0.5) * 2.0;
    normalizedCoord.x *= aspect;

    float r = length(normalizedCoord);
    float maxDistance = sqrt(aspect * aspect + 1.0);
    float normalizedR = r / maxDistance;

    float distortedR = r * (1.0 + strength * normalizedR * normalizedR);

    vec2 distortedCoord;
    if (r > 0.0) {
        distortedCoord = normalizedCoord * (distortedR / r);
    } else {
        distortedCoord = normalizedCoord;
    }

    distortedCoord.x /= aspect;
    vec2 textureCoord = (distortedCoord / 2.0) + 0.5;

    if (textureCoord.x < 0.0 || textureCoord.x > 1.0 || textureCoord.y < 0.0 || textureCoord.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = texture2D(screenTexture, textureCoord);
    }
}
        `
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    // キャンバスのサイズを画面サイズに合わせて初期化する
    function init() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        // set device pixel ratio so canvas looks crisp after orientation change
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, height);
        
        // シェーダーの解像度も更新
        material.uniforms.resolution.value.set(width, height);
        // CanvasTexture はキャンバスサイズが変わると再生成した方が安定する環境がある
        if (texture) {
            try {
                texture.dispose();
            } catch (e) {}
        }
        texture = new THREE.CanvasTexture(canvas);
        material.uniforms.screenTexture.value = texture;
    }

    let textLines = [];
    let scrollOffset = 0;
    const displayTexts = [
        "CRT Effect",
        "created by Akkie314",
        "",
        "C:\\aki> dir",
        "2025/09/05 <DIR> .",
        "2025/09/05 <DIR> ..",
        "2025/09/05 <DIR> profile",
        "2025/09/05       message.txt",
        "",
        "C:\\aki> cd profile",
        "",
        "C:\\aki\\profile> type name.txt",
        "Akkie314 (X: @aki_31415926)",
        "",
        "C:\\aki\\profile> type aff.txt",
        "University student",
        "",
        "C:\\aki\\profile> type hobbies.txt",
        "Bowling, creating things",
        "",
        "C:\\aki\\profile> cd ../",
        "",
        "C:\\aki> type message.txt",
        "Thank you for watching!",
        "I will continue to make new works.",
        "",
        "Looping back to the beginning.",
        "---------- END ----------",
        "               ",
        "--------- START ---------",
    ];
    
    const maxTextLength = Math.max(...displayTexts.map(text => text.length));
    
    // 画面サイズに応じて適切なフォントサイズを計算する
    function calculateFontSize() {
        const availableWidth = canvas.width - FONT_PADDING;
        const fontSize = Math.floor(availableWidth / (maxTextLength * FONT_WIDTH_RATIO));
        return Math.max(MIN_FONT_SIZE, Math.min(fontSize, MAX_FONT_SIZE));
    }
    
    let lastUpdateTime = 0;
    let currentLineIndex = 0;
    let currentCharIndex = 0;
    let currentDisplayLine = "";
    let isWaitingForNewLine = false;
    let newLineWaitStartTime = 0;

    // メインの更新ループ - 文字表示、レンダリング、エフェクトを処理する
    function update() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!isWaitingForNewLine && performance.now() - lastUpdateTime > CHAR_DISPLAY_INTERVAL) {
            lastUpdateTime = performance.now();

            const currentLine = displayTexts[currentLineIndex % displayTexts.length];
            
            if (currentCharIndex < currentLine.length) {
                currentDisplayLine += currentLine[currentCharIndex];
                currentCharIndex++;
            } else {
                textLines.push(currentDisplayLine);
                currentDisplayLine = "";
                currentCharIndex = 0;
                currentLineIndex++;
                
                isWaitingForNewLine = true;
                newLineWaitStartTime = performance.now();
            }
        }
        
        if (isWaitingForNewLine && performance.now() - newLineWaitStartTime > LINE_BREAK_WAIT_TIME) {
            isWaitingForNewLine = false;
        }

        // 現在表示中の行も表示に含める（最後の行として）
        const displayLines = [...textLines];
        if (currentDisplayLine.length > 0) {
            displayLines.push(currentDisplayLine);
        }

        // 背景を黒に
        ctx.fillStyle = `rgb(0, 0, 0)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const fontSize = calculateFontSize();
        const lineHeight = fontSize * LINE_HEIGHT_RATIO;
        
        const maxVisibleLines = Math.floor((canvas.height - fontSize * 2) / lineHeight);
        
        if (displayLines.length > maxVisibleLines) {
            scrollOffset = displayLines.length - maxVisibleLines;
        } else {
            scrollOffset = 0;
        }
        
        const visibleLines = displayLines.slice(scrollOffset, scrollOffset + maxVisibleLines);
        const startY = fontSize;

        // テキストを中央に配置するためのX座標を計算
        const fontSize_calc = calculateFontSize();
        const textWidth = maxTextLength * fontSize_calc * FONT_WIDTH_RATIO;
        const startX = (canvas.width - textWidth) / 2;

        fillText(visibleLines, startX, startY, fontSize, `rgba(169, 255, 147, 1)`, `rgb(0, 255, 0)`);
        scanLine();
        flicker();

        texture.needsUpdate = true;
        renderer.render(scene, camera);

        requestAnimationFrame(update);
    }

    document.addEventListener("resize", init)
    window.addEventListener("resize", init)


    // CRT風の走査線エフェクトを描画する
    function scanLine() {
        let lineWeight;
        scanLineOffset -= canvas.height / SCAN_LINE_SPEED;
        if (scanLineOffset > canvas.height / SCAN_LINE_DENSITY) {
            scanLineOffset = 0;
        }

        for (let y = scanLineOffset; y < canvas.height; y += canvas.height / SCAN_LINE_DENSITY) {
            lineWeight = 5 * Math.random();
            ctx.fillStyle = `rgba(0, 0, 0, 0.2)`;
            ctx.fillRect(0, y, canvas.width, lineWeight);
        }
    }

    // CRT風の画面ちらつきエフェクトを適用する
    function flicker() {
        const flickerAmount = (FLICKER_MAX - FLICKER_MIN) * Math.random() + FLICKER_MIN;
        targetCanvas.style.filter = `brightness(${flickerAmount})`;
    }

    // グロー効果付きの文字を描画する
    function fillText(textLines, x, y, fontSize = 16, color, glowColor) {
        const lineHeight = fontSize * LINE_HEIGHT_RATIO;

        textLines.forEach((line, index) => {
            ctx.fillStyle = color;
            // 優先フォントを使用（フォールバックとして monospace を残す）
            ctx.font = `${fontSize}px ${PREFERRED_FONT_FAMILY}`;
            ctx.fillText(line, x, y + index * lineHeight);

            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 2;
            ctx.strokeText(line, x, y + index * lineHeight);
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = fontSize / 4;
            ctx.fillText(line, x, y + index * lineHeight);
            ctx.shadowBlur = 0;
        });
    }

    // フォントがロードされるのを待ってから初期化／描画を開始
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            init();
            update();
        });
    } else {
        // 古い環境では即実行
                if (texture) texture.needsUpdate = true;
                // WebGL が利用できない/コンテキスト喪失時はレンダリングをスキップ
                if (!webglContextLost) {
                    try {
                        renderer.render(scene, camera);
                    } catch (err) {
                        // レンダリングで例外が出てもループが止まらないようにする
                        webglContextLost = true;
                        console.error('Renderer error, skipping frame:', err);
                    }
                }
    }
});
            // document では resize を受け取らないため削除し、window のみでハンドルする
            window.addEventListener("resize", init);

            // スマホの向きを変えたときに確実に再初期化する
            window.addEventListener('orientationchange', () => {
                init();
                if (texture) texture.needsUpdate = true;
            });

            // WebGL コンテキストが失われた場合にループが止まらないように保険をかける
            let webglContextLost = false;
            const glCanvas = targetCanvas;
            glCanvas.addEventListener('webglcontextlost', (e) => {
                webglContextLost = true;
                e.preventDefault();
            }, false);
            glCanvas.addEventListener('webglcontextrestored', () => {
                webglContextLost = false;
                // WebGL コンテキストが復帰したらレンダラーとテクスチャを再初期化
                try {
                    renderer.forceContextLoss && renderer.forceContextLoss();
                } catch (e) {}
                init();
            }, false);