# Markdown Note v1.0 — Release Notes

> *"마크다운으로 글을 쓰는 가장 자연스러운 방법"* 

이번 릴리스는 **에디터 코어 재설계**, **인라인 목차**, 그리고 한 번에 풀스크린으로 띄울 수 있는 **발표 모드**를 추가합니다.

---

## ✨ 새로운 기능
### 인라인 목차
문서 우측에 `On this page` 카드가 자동으로 나타나, 헤딩 구조를 한눈에 보여줍니다. 커서를 옮기면 현재 헤딩이 강조됩니다.

### 발표 모드
`⌘⇧P` 한 번으로 깔끔한 풀스크린 발표 화면. 별도 도구 없이 회의실에서 바로 사용할 수 있습니다.
- **휠 스크롤**로 페이지 이동
- **⌘ + 휠**로 글자 크기 조정
- **ESC**로 즉시 종료

### 폰트 5종 선택
> Format → Font 메뉴에서 선택 가능합니다.
1. **System Default** — macOS 표준
2. **Pretendard** — 한글 친화
3. **JetBrains Mono** — 개발자 친화 mono
4. **SF Mono** — Apple 시스템 mono
5. **iA Writer Quattro** — 작가용 클래식

---

## 🛠 개선 사항
### 코드 하이라이트

```python
def fibonacci(n):
    """N번째 피보나치 수 — O(n)"""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

# 처음 10개
for i in range(10):
    print(fibonacci(i))
```

```typescript
interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  modifiedAt: Date;
}

const isRecent = (note: Note): boolean =>
  Date.now() - note.modifiedAt.getTime() < 86_400_000;
```

### 인라인 코드와 링크

`useState`, `useEffect` 같은 인라인 코드는 옅은 배경 + monospace로 강조됩니다. 링크는 [예: GitHub](https://github.com)처럼 색상으로 자연스럽게 구분됩니다.

---

## 📋 작업 목록
다음 릴리스(v1.1)에 들어갈 항목
- [x] 인라인 TOC 사이드 카드
- [x] 발표 모드 풀스크린
- [x] 폰트 선택 메뉴
- [x] 디자인 시스템 토큰 적용
- [ ] iCloud 동기화 안내
- [ ] PDF 내보내기
- [ ] 다크 모드 정밀 튜닝
- [ ] 윈도우 split view (좌/우 두 파일)

---

## 📊 성능 지표

| 항목 | v0.9 | v1.0 | 개선 |
|---|---:|---:|---:|
| 문서 열기 | 180ms | 90ms | **-50%** |
| 입력 반응 | 22ms | 8ms | **-64%** |
| 메모리 (idle) | 142MB | 98MB | **-31%** |
| 시작 시간 | 1.4s | 0.8s | **-43%** |

> 측정 환경: MacBook Pro M3, macOS 15.2, 1000줄 문서 기준

---

## 💬 인용
> The best writing app is the one that gets out of your way.
>
> — *Some random reviewer, 2025*

---

## 🖼️ 이미지 첨부

이미지를 에디터에 드래그 앤 드롭하면 `attachments/` 폴더에 자동 저장되고, 아래처럼 인라인으로 표시됩니다.

![sample](attachments/sample.png)

> 이미지 옆 캡션도 인용문 형태로 자연스럽게 작성할 수 있습니다.

---

## 🧪 한국어 + 영어 혼합

한 줄에 한국어와 English를 섞어 써도 letter-spacing이 자연스럽게 잡혀, *typography quality* 가 떨어지지 않습니다.
코드 안의 한글도 잘 표시됩니다

```swift
struct 사용자: Identifiable {
    let id: UUID
    let 이름: String
    var 활성: Bool = true
}

let 김지은 = 사용자(id: UUID(), 이름: "김지은")
print("안녕하세요, \(김지은.이름)님 👋")
```

---

## 🚀 다음 단계
1. **노트 폴더 정하기** — `⌘O`로 원하는 폴더를 열어보세요
2. **첫 노트 쓰기** — `⌘N`으로 새 파일
3. **발표 모드** — 작성한 글을 바로 `⌘⇧P`로 띄워보세요

---

*문서 끝. 즐거운 글쓰기 되세요!* ✍️
