//5-1
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
int main() {
    srandom(time(NULL));
    int num;
    int user_input;
    num = random() % 128 + 1;
    for (int i = 1; i <= 3; i++) {
        printf("%d回目の挑戦\n", i);
        printf("入力: "); scanf("%d", &user_input);
        if (user_input == num) {
            printf("正解\n");
            break;
        } else if (user_input - num <= 5 && num - user_input <= 5) {
            printf("誤差5以内\n");
        } else if (user_input - num <= 10 && num - user_input <= 10) {
            printf("誤差10以内\n");
        } else {
            printf("誤差10以上\n");
        }
        printf("\n");
    }
    printf("正解: %d\n", num);
    return 0;
}
