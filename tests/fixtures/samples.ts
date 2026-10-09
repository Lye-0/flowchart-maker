export const samples = [
  { name: '偶数・奇数', file: 'even-odd.c', code: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);

    int d = n % 2;
    if (d == 0) {
        printf("even\\n");
    } else {
        printf("odd\\n");
    }

    return 0;
}
` },
  { name: '繰り返し', file: 'loop.c', code: `#include <stdio.h>

int main(void) {
    for (int k = 1; k <= 5; k++) {
        if (k == 3) {
            continue;
        }
        printf("%d\\n", k);
    }
    return 0;
}
` },
  { name: 'サブルーチン', file: 'functions.c', code: `#include <stdio.h>

void show(int value) {
    printf("%d\\n", value);
}

int main(void) {
    int k = 1;
    while (k <= 3) {
        show(k);
        k++;
    }
    return 0;
}
` },
  { name: '未解決箇所', file: 'unresolved.c', code: `#include <stdio.h>
#define CUSTOM_STEP(x) external_action(x)

int main(void) {
    int n = 10;
    CUSTOM_STEP(n);
    printf("%d\\n", n);
    return 0;
}
` },
];
