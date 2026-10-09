//4-1  range from 0 to 2^31 - 1
//4-2 1~128とする

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main() {
    srandom(time(NULL));
    int num;
    int user_input;
    num = random() % 128 + 1;

    printf("%d\n", num);
    printf("入力: ");
    scanf("%d", &user_input);
    printf("%d\n", user_input);

    return 0;
}
