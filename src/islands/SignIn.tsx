import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { initialsFor } from './account';
import { performAuthAction, resendSeconds, safeNext, signInMessage, type AuthAction, type SignInAuth } from './signin.ts';
export type { SignInAuth } from './signin.ts';

// Google's unchanged, pre-approved light/pill artwork (including its prescribed lettering).
// https://developers.google.com/identity/branding-guidelines, signin-assets.zip, Android + Web/PNG @2x/Light.
// Embedded locally to avoid third-party image requests or changing another task's asset files.
const googlePill = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAABQCAYAAAA0u++hAAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAHctJREFUeAHtnQ10HNV1x+/srr4lkJ0YbBmMMGkgtmOchnIIyFgh4CY0JYYQ4DSn4eMkLpRDgNrGStMGEwIRshNMkxTi0wKlpHwkrQGnNLFpImJDnASCcYyJCTZywBI5KZZkydLK2t3p/b/du34edvZLmvXKvj+dp5mdnZmdjzf/uXPffXccOoysWLGicWhoqDVBiWbXcU53iJodcprxnUtuMymKopSGPtafLpeHXLocx9lNFOqsr67ewjrVR4cJh0qICDL/6gI+CItUhBVFKXcg3DzodFznydra2s5SCnZJBHppW1ur48ZvZFFu5Y+NMr26upqamppoetN0mjZtGtXU1ND0aU3mu0mTJpGiKEopiEajtHfvXhrmYXf3Hurt66M9POzu7jbf2bBoPgix7ujoeIICJjCBhrU8ODR0IznuTWSJ8syZM2nOrNkszNPpFB5XFEUpZyDSO3ftpG3bX6Fdu3alpxvL2qHbwhTubG9v76IAGHeBziTMsIbP+PAZdG7LfGM1K4qiTER6e3uNWK9/ZoMZB8Z37ToPrurouI3GmXEV6GVty67i1r1b2ZXRjM+wlheev1AtZUVRjjhgUW/ctDFtVYtFvbJ95YM0ToyLQLe1tTXH3PgDlPQxqzArinLUsJMF+rHvP2ZZ1M4TYSd083i4PcYs0MuWL0Pj3woebYT7AsI8v6WFFEVRjiZeePEF2/XR5zh081it6aIF2viah4duJTK+ZprNDX9XXHa5+pgVRTlqgThDpCHWIETO6o67Om6mIilKoOHSiLvxtWw5z1OrWVEU5VA2PreJNmxYb8L2WGS3hJ3wxcW4PAoW6JQ4/xQNgYjOuG7xtRqzrCiK4gHW9L1r7jNDNCCySH+0UJEOFzKzLc7oYPKFaz6v4qwoipIBdLybM3uOCcsbGBxsdMlddO78c5/ctGlT3j0R8xZorzjDcm5oaCBFURQlMxDpefPm0Y4dO4oS6bwEOpM4a2OgoihKbioiFUWLdCiP9VOqQVDFWVEUpQhqqmvo2r+5lpqmTSNoKTQVkXC5lssp0EuX33I3ojXga77qr69UcVYURSkCiPRVn7vKtNtBU4dMmHJ2sro4TNdtonaI8hevv0EbBBVFUcaANBwiTno0Fjvr7HNa+p9/7rnNfvP7CjT8zgnXXcuj1Rd+/EI69dRTSVEURRkbEOlIRQXteG0HAp3PYn/0Y37+aF8XB/tI7uZBI7LQaScURVGU8WP+OS2m9zXTmMpjlJGMAg3XBt54ApfGwvMvIEVRFGV8ufyyy9gvbdr0WlPu5HeRsSfhsuXL3kBL4+WfuczkcT4sbN1C7ssvE+3aSe7O18nZv59ocCD5XX090dSpRHU8/OA8ck6fRzR3LimKokwk0CX8qXVPmZ6GdTV1H/K+TiviXWDpLbfcincFSpL9kvKHt8nd8GNy/+s/ifYPkuM45Lruu+cbHESOP7698G5t3UbuI4+yYE9nsZ5LzmevIDpuCimKopQ7cHVse2Ubcko3D0aHkHhuhf39IRa03SHl2sXXli6fM4ux+y/fInf9j4kSIbzSO1kgwCmBdmQ8PYR3JkxOuIJcp4I/VvIiIf6a2z0/di7RFZewUL+XFEVRyhnkk75vzX0Y7auvqTvZtqIP8UHHKd4KcYYwl0qc3R89SonrP01u59O8NRBey2J2M4yLOHNxIpU8oYKXq2KR5nEU7NIzzxJ96TYe/oQURVHKGWjtzKTeNqas6DSHNhK6ZAKnW84pUdTGY6uIHllFzkg/W8KJpECLSMO2dxxr06zPxroOs1bzZwdemjDeYsCLxdkCP8AlStTze6Jv3k30vYdJURSlnEHKZoPr3mhPTwv0kluWLJIUogikDpToPqJ/vorcnz3EBjALcyTOOptgzbXF+eDscG84Is6wnkNcEkal2XL2CHO6jCTL+h8ZF4qiKEq5Ais61RGwcWnb0laZnhbokBP6FIYlCat76K+I3vo5UVWMqBIlQS4LNIXjSZFOuzqSbg3X6+pIJFLfs6gnRlNiPMRlOCXOLNbE6z2eGws7ViWjPRRFUcoYCcpw3FDaijYCfdNNNzWy3F2F8VNmnkKBspG9KPu2EtWMklPDlm9VPCnSFTFjSbss0hS2rOiQJxLQfOTvXRZpiLM7kixGpFmYXV4PLOrjjmNx/gaL9FRSFEUpd6RDoEtuqyRSMmF24cpwK4aWmR0Mux4hev1etmgjyVuDiC2G8Ccn4K4IsfbGzTSn4VhyLrqUaO7pvHGnHLSE4bLYudPESNPatSY8LynaKasbMdId31RxVhRlwoBkSmgs3LVrV+PQyFArT3rCCDTcG5C22bMC9D0Pc6PdzjtZZEeTFnKqQdDhYhwYEGgubiJEznuaiD79eXLO+0TmdUGoIdooiy4h2rCe6OEHid5+OynKZSbOb731Fm3evNkMwaxZs0w54YQTfJdZv3497du3j84666ys85Ubsp8Tbbv9mMj7I9su9Q7bj4J9UcqTObNmQ6BZB91WEoFm8CHY0Lrdt/M/tnhrw2y3syQjaiMl1KZDCjf+JVigQ3PPI+fqFTxfAW9ruWBhsifhvd8huu76shFnXBhLly41F0omrrnmGriX6Jhjjjlk+le/+lW6//77zTguqKeffvpd85QjuKksXrw4/fnRRx+d0GKwevVqU8BYzkMLP7qKSG7atClQocdNHXUHBeOZwO9feumlphwJN9Fc4Pq74oorzDjqI+pludLUNF1G0SZ4Uyjlf25GhiUk5A+Ekd1EvQ8RVbMo17L7opb9xPVsSTewz7j+ACUaYhSrZ//zuYvIuf4bhYmzAFFecXtZiTMqhZ84A1xEmMd7IUHo7PXIxV3uePc1275PBHKdB3z+wQ9+YEo57CvqE24GuKn4iTPAdmMe1D17H5XDD4xk5OeAJsMPHYlUV89Doxoy/QdGz9eS3m5EXoRSljNb0W7EoUQoRDH+HJsyh+ouuZ2OFFD55YKG1QVrBW4NXDjbt283FzXAOC6Wr3zlK+llYdV4H0snAti/bJ8nGrC2cH5ApvMgT0gy7+G0zGxrX8A2iTsN9Q7bC0GWuoUhnnjwZDDRz9WRxDQ2lOHmgB+aZTPRiomBWc9g/0YWZScl0G4yC3UkQS6LdYzdG9Gq91DDed+mIwXb3wxw4WYSL7gyAMTaFug1a9akH1Eh7BPBvQGwrQD7D3FYuHAhTWTgfsJ5wv7AHVWu5wF1xRZnbDPqUyb3EqajvmF+1FHZR6V8aEoJdCJOzbBrmzFxUuNkCoRBFufR3yc7lxiBpmQnk5AJ2qARqqTQiYspVD+djhRscYZIZboAcMFL45P3QoIQ4MKZiIhv80hAnnzKeX9Qh+RGD7Ctq1atyroM5kGdgzWNeqiUF03TksayG3JPj5DrnmQmBmVB79+U7P2X7PiX6inI7o2QQ3GqoGhFDU0+YREdqWTzBdpWs3cZebSGSPhZOLDs5JEVy2A+3BBE8MUv6l0H1i3bhen4XtYlv4vpuHgLda/Yvlj7xpMpmkB8uLI93u3PhX2cvL9nY++vn8vI3j45Xn7nQdZn/zY+2/sux9UPzIt9x29iPnniKPR425Yzls0lzva8hYgz9k/OlWwz1lHo+fKuA8cp38ZKLI86Kk+o3uNmn8Ncxz+ofRwPamqS731luWx2li5f9hKPz7v5izcFI9Jdn+U9X3dQoF3pHciujVgNjdR/hhpPy9+9cce6A+nQaYdHkkXWm+z67aaGCfNtqj8ijHa+MSR7krs09ViHrllQQUFgtxoDCHEhFwMqifg2M1lEqEi4MCXSwwuWwe9deOGF5rPXP2o3XsL/iPWIT9xLodve3NycHu/q6kqP2z5S7A/2wbb8bPB7fjcvG6xjrpUHPFOEBC60FuuNQHgyyfR0Al+sNJjJ79vnwT6GdlSGH3YEizeKwy+yB4KAY5Ova8i7/0FFzUhd8zM2sL04Xn4im6u+AtRZnBe/deB44bhlOu44bvh9uekB+1jkE8UhbiK/fcy1feNJb28v3XnX102O6IMujskBdVAZfZOMP0M6BKY6pyA1qBsKU8WxZ1IhrN0WSep8cjXveuOAaw1N+F7qJ930TydFvYFvUtcsoEAQt4VchBAi3JXl0XKsoLLZ1psXsQLyAZUyW0s+tl0am8YLXAzZtg/f52PhiQUlxznTI7tXCHFsMgm0PV+QvvNsYZcQB3yPm2Y+QmCvJ6j4ZmyP381bkCcvCJ93u7FPueorkEiYTOvAsrbB40WOW7Hi6W1gRb1CwXpFsGX7Sh3yCo+w6VKIXiyBAIGWBEdOuv92KlmdQ5V1pxWyNraKQ+waCZlhgtcb95REqpi46pR9nbBs7eQyYeobCdNAlAIDlpBdYXCCUclgTflZAvmAimRXdggSrDJYqxjid1GB8hVoXFxiuW3dutUUWYeQzfIpBtk2CCW2Gb/pvTC9EQl+2KKU6UbjnZYpXA4Xnu0CySV0sNZwjOybAW5gmCYlmyWI77C/2G/sv33DkDjmfLDPcRANfTgHtjjDwJDthlDZ+ylhpV4LVIwTAccMy6K+Ymjvux0VY0+zY+vFjYNtwDqwPdJGUMw1JSGHgtTJTPXSO29QSG9uhNpFKGhi/QddG+mcR8mcziEHWeyKiHn2kLaoc5C2olPjAyNkLOkgkIvQW8nt2NlCH5vERyZ4H9elAwIu1kwXix9ei00qvFwsQcT4el0n8ugp7ggJC8t1bLCtctGIb9i+uWQSba8Vbc+TjxUqFjaOi4ipNCjmQuqF7JfdICz7ge3Jx8VjC1I2gRbxzIW4KmQZr3DZx0zC93C84EqT84XjIfNJXRcgrPYxknXgd6W+4phKFBCwI6K8xw7I0yqOYzGGhH1DyOT+knop+yj7VyorOkSBk0psJHky0iVBYRqlUJECbXtMEnnOKx/yEfPxQO72uBtnanBD5cWJz9fa9VZWv0gPaeDLB78GGvsxf7w7yvi5LzDdFpp8ftdu9PM23NnCC+GRiypbh5qgIzb8GgLt3w2iY5I8OWQr9rHzunz86hr2xb6Z2MvZAp8tGsZbX22h9RokfjfsYkRTUjDIfmTbR3vbS9m5J3gLOswCHO9Lm6+um2rUSzkfaGgrUWXhviNX1kcHE9/5Ca/rWS5fi3u8kEpsN2RIxRMfHUQ8VwWzL6BcftJ8/ZF+6wnSQsi27cX8rm1F4+KRfbcvJMwjEQDi0sBv2cJUijwVfiJVjP/UXiaXqGdrwMv0pGUfu1x1Dd+Lz9Z7bIVcNz77HNoin2/bgESEFPK0543CyfaUYe9LvgbVeBBxyOnCS2LRchhIJrsQC3Rs7yEujoTrmmbCBLzDB94ozIxPKXL6dYXWS1byXDTdwNhQRSVHHslQ4J+TCwSCncvqtS+kXBd0vhf84eh8Md6/6fVDi0UnF6s8AkMEZJocb7+wwKAYz323nzayCRPqAgyATNj5U+xtK6Su2Y1qsqxXoAupr36uuVzHrtCbXLYwyWzk6zosluHosIz2BW9BV88hGnnDCLLrJjPXoZ9KnMdQEn1PUsNx1+e/vtQ7C40dnimEw8mxaOp7+J6D8j8L2XyoEAvbzye91bLhdwFlIuhKVE6IAIsf1C5ArDfbApOID6+VPZHw7rftu82XQv3v5Uyhdd6+njJ1GPMj6OMEYxnAeEZGjC4eb97TvScQC9qtbyG374mU59mlGMSZhXqUP+O9Jwf2/5rq2AUSCjfmtb4f/m1y03Px1FaX1qSNBiedclos6Kb8fq4o4EOT0KNsrgvbAsqnctnryXW3L+VjWDkAcRXfpd3hBsgFZYflyaO43ZlnogkUthk3HXGXSYhevla6txHPvoHZhgWOZbZj442MkWXtnDJYRzYL1y8ixV5HrhtQoXXee5zKpffu8HAyvMx13L4Q+wp240M0GlDMWfVcFuQEjSbiNJJIUJTH97NAD/Cwnz+/E+ulPW/fk/fqmo51uFDO0r0v6UJxnaQzxU3fIlzjHjn1eAoECcoXAcgWllNoY5B9AXnzfXgpRThQOeG1jm33hi0M9nziYvJOn0jYjWPS7Tufm73X5+ptLLaFMFsnFWCLvL2cdx3ZsL+3Bdo+L9nWIb0yC8Fet/Qe9CNTeGZQdLOxDFixukKUSGwxE3u6KQichgV0IHQsjfD4EAtzUpxd6ueyl8v/8Va83PMtGhjpovFiz74Erd0+QvFwjOJOjBIhJGZyU2Kd/DtjBgUCLhZvi3SmiiUhSUK+IVp2pbcz5gm4kOBTLFVlKhfkcR/YNy/vcbU/+1mPxWB3Jy8l3ugDiQzK9oSF7zCP3bXdaz1Kwx8Q4c+EJF4S7ONrJ5jCb/oZDd5QVHtbvDfeTOvAuv22Lxv2U5NcN5nOoYQpIgS0kPDVYtnbl3Zx7DYuDjgAuruDEWjDcTfQYPdt7NJw2IJ2aYgg1kQDPBzgYX+sn/779cV0xezxCV+5Z/MgHYjE2NkdoogboZAbZv93mBsjpTkyRH86I7ebpFhQMe07OiqPHV0gj9hCIdEDCNuz405RacRK9LaiH01+aGC7OYRMiajs3ocyrRiB9rqocF6wbskSVyqXCeqb/bQmgiJ5JGyhzfTklaljjXRekgZE6Ulni643D7Y3lE6EX8RThFjWYefWELyhdDiGmF/Oq6xDcm3gxmjnSym0ztvXE9aDcfyenYvFfoLwxtkHwUEtTnRG4gfinZGqEFvQPRQUNcffSG/uuc2IM9on96fKADuF97khU3b1/5wO/O4G+tyffIvGwprf7KWHX++lcEUFVSQqKM4lkohQOBExIu1wOe99cIMEFwKOE4jgdtvC9YqyPS/Si+bbAi3B+raV7F2v9+I6WoAYeR+V/WK8xyN6Q56W5De9Pt1SIsImaURle7K5BSRO32//Jf7ZFn4/SxXryNS5JtPNw28d0nHLi6zXPs7em4wYKYUef7mexDLOtn2YF9dq0PSkBLq+un5LiA9cH1oLh4eHaeeuXRQEaACsnXoj9fN4n4viUG+CCwtzbwIlwi6PCvrRH9bS7duvp55ocdb8d159k5b96jWKVgzQaMV+tqKHKRaJ0mgYZYRioVGKc/nsGcH3z5ETn811gUpVTLJ0zC/rtu/mYh0erQnYbTcH8Dv2Xmt5LO6NQpNJBYl0xc7VO1UsW9STXDcnzJcpn7l3XZjHz7LE99m6v0uyo2yZ+OR77/ZKH4OxvCwB+4Zj4Vdf7ONVTLx6IcDVPMztgdDkFStW9Jnn/CXLl63mkRsv+uRF6Vd/jzexeB9t2DKT3Rl9NMgCPcibMMgCPcDCjLLPreFhHQ/rqb7y/XT1SYvpkmnn57Xu3UMD9IVf/pI29uwnZ7SWreUaqohV87CaIvFKtqSrKByPsCVdSSfWV9JPPl/a2F95VPJ2iBivRyW7d6FgZ/CCAJXizn80I+dYUlQejvhyL9Lw5U2jWuzNW9YnERnS87OQfZXrQEJQi+kcZHeuseu8naWx2Mx+sn+SblSMnlKdz42bNtJTP1yHQIYHV7avvDop0LcsWeQ4obV4H9a1i6+loHi1559o4+6b2b3BwswW9H6KGHEepGr+XMOCXc+fk2WIy5SqE+nSaR+lsyfNog/Wz6BjI7VmPf2xIfr90F762d4uWtfzBnX+4R1y43wA4/V8J2CBjqNUsThDoKuMSIdZnCPs7njuyqk0/ZgwTWQkd3O2fA12FrJysvIUpVCkI1e2fCcQVPElAzvV7UTi3jX3mbephELOxR1f70i+1Tvlh+5jF0cjerEEldnuA9O+SD0jXWzpftuI9H72Bw9RBQ2zeEbdai5VNMJllEuMG/e6ou9Q+64nKEFPWXmWcE9hfzIvk2AL2U3UkROqY/9ylL/j3QmHTaa75AJOehE37tLfndk44cXZzlsMMom0/c5DMNFfPaUcvcAYkegKsWYzuRnshryJ+kafvb17jTiD2qraTgyNWvFBiJ7Tcg6eB06riFTQKTNPoaA4ufHP6dX+jdQ9wr4Wt5IFutoUvi3w5xozHKEqOsDCHWfBNXmjnaTPGOlJnXTmDcdsvuviOxZmF7sSMvMnh9IfPCnSc95TTd89f+K/VuuPf/wjPfvss2b8pZdeMmI9ZcoUMx3CvG7dOvryl79MIyMjZp4j6RVUytEHRBnGBsQXdRrjqOtVVVXpqBQ06qHeC3DnlYOLqVBe2f6KKXBv3Pm1Ox/DtHSs2dK2pa0sZj9Fb8K/X/4lCpLhWD/d9Zu/pB37f8euDBZot5ZLHVvUtaZEWagPsHjHWKRNbmfXSXU0SW0yRBnizS6LBLtGEolatpDrKMEuDjeO8RpyeLoThx+6ik6ubaD/+fgcmsH+5yMBVMh8UitKY+JErKyKIkjYYD6x/X5vzJkI4C0q6OYt7g1MSz/vP7/p+a6zW865KRqNVsOCnjwpoDesMBWhamqddjXti+2nrQOvssXMFrRxcUCY2cXBwhxjqxgJSd20tSwdtlOYt6Ug8X+YS8SItmPmR+fIlCXN88ydfAx1fuJDdHxNMK+3OhwsWLDAPOb5dY6AIF933XV0xx13qDgrEx6JU/emk7WB68Obb3oisW37Ntr8i1+Y6I2V7R3XyfRDemssbbtlBZurtwbdWGjz47efpPu6HqBd0X4W6Voj1Aeokv3QItAHcShpSZuh6XwCK7qKhzXGck6w5ewmZFhNN7xvDn3zQ3PpSAaPeHai+vGOEFGUckKiLOyIqLFEppQL0jjINuXVK9tXPijTDxFofjRojFRVvMGjjRBoCHUp6I6+Td/uepge7f4ZRdmaHnWTFrRL8k5B28UhlnQoJdCVPKxOi3KChXr+5Jn0D6edSQumTCVFUZRyBv1P7mOBhvUcdkIfbW9v75LvDglpQGPh2fNbEMLR2sstimd8+AwqBQ2RevrYe8+mS6Z9jPpjw9Qbi1JfDH0OD+2O7aT+JJ+zNBaid2BjpJb+rPFEWjPvL+gfP3AmNdfVk6IoSrkDcTbJ6hz3no72pO9ZeFdCCljRFVWVLyGJ/6c+edEhr6wvJZt6f0sbuTzX91sW6yF6M/oO9Y8OmS1GPPQx4Tr6YMNJNKNqCrVM+gBbze/j6QG9+FZRFCUAXnjxBXrs+48nfc93dZzs/T5jxqBlbcuucl16oKamhr60vC24N34riqIcpSDu+b413zWRG17fs5AxKUVqxk7k53j88cdJURRFGV82PPNMUpzJeSKTOAPfrEERJ3w1D/q2bX/F931miqIoSuEg5wbcG0wfNwze7Defr0CblkTXvQ3j6/93gzHHFUVRlLEBLV3/zAYzzq6Nm+2oDS9ZE1M8/9zzmz/S8pFJsVj8LHRBnD17NsEvrSiKohSO+J0HB5HPk+5ZedfK9mzz50yMHB+Jr+DBFvhK/u3fH7JfCa4oiqLkCbQTGpr0O9MWFuecfdJzCjQS+rM/+mKEgeBVLFB/FWlFUZT8gWZCO6GhyQ4p4YvzWS6v3JvcSNh37vz5T7pEiwYGBhp3vPYazTv9dELmO0VRFMWfd4vzob0Fs5F3cuRMIn3q+9+vPmlFURQf4HP+1wfuL0qcQUHZ670irQ2HiqIomZEGQeSvLkacQcGvFxGRTpDbGo1Gp7746xeNq2PGjBmkKIqiJOOcv/fIf0i0xhb2OX+iUHEGDo2BJcuXrHYodCPGkVjpgvPPp8mTJpOiKMrRCPzNjz3+uHkzCkAoXV1N3Qq8oZuKYEwCDVJ5O+7m0Ua8jWXh+ReULAueoihKuQCrGR1QTGY6oj509FvVsWo1jYExCzRoa2trjrvxu+GbxmcI9eWfubxk+aQVRVEOF8jnvOGZ9WZocKgzQuGri3FpeBkXgRZgTZPr3IpUpfgMgW5pmU9zZs0mRVGUIwmvMKMhkBz3Nr/ER8UwrgItLG1busJxQ1eKUIvrYyYLtvqoFUWZqMDHjORxv3rxBdMjMEUfku3XV9evLtbX7EcgAg2M24PirbZFDWBVz2aLGi+mbWpqIkVRlHIGFnJ39x7T8Jd2YyQJTJiFwATaZsktSxY5IWcRi/WV9vTq6mqaziLd1DSdJjU2mmENT5s0eZK+JEBRlJIh1vCenm5CHvyenh4jynu6u6XRT+hjV0an6yTuWdW+qpMCpiQCLfBdpnFgaKAVYs0ukAW2Za0oilKOOI6D1MtPJtxEZ0NtQ2dQ1nLG36bDCAR7MDo4jyjUymJ9Em9MM7nUSBiSGSqKogSOEWHCu6jdLpeoy0m4L2O81ILs5f8BOzyYiNI+ebIAAAAASUVORK5CYII=';
const googleCircle = 'data:image/png;base64,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';

export const authButton = 'inline-flex min-h-12 w-full items-center justify-center rounded-pill border border-control px-4 py-3 leading-relaxed aria-disabled:opacity-50';
export const authInput = 'mt-2 block h-12.5 w-full rounded-lg border border-control bg-page px-4 text-ink leading-relaxed';

export function AccountsUnavailable() {
  return <div data-testid="signin-unavailable" className="text-center">
    <p className="text-ink-soft">{signInMessage('unavailable')}</p>
    <a href="/#signup" className="mt-4 inline-flex min-h-12 items-center underline">get launch updates</a>
  </div>;
}

export function PasswordField({ id, value, onChange, readOnly, problem, fresh = false }: {
  id: string; value: string; onChange: (value: string) => void; readOnly: boolean; problem?: string; fresh?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return <div>
    <label htmlFor={id} className="block">password</label>
    <div className="relative">
      <input id={id} name="password" type={shown ? 'text' : 'password'}
        autoComplete={fresh ? 'new-password' : 'current-password'} required maxLength={72}
        value={value} readOnly={readOnly} onChange={event => onChange(event.target.value)}
        aria-invalid={problem ? true : undefined} aria-describedby={`${id}-hint${problem ? ` ${id}-error` : ''}`}
        className={`${authInput} pr-20`} />
      <button type="button" aria-label={shown ? 'hide password' : 'show password'} aria-pressed={shown}
        aria-controls={id} className="absolute right-0 bottom-0 min-h-12 rounded-pill px-3 underline" onClick={() => setShown(!shown)}>
        {shown ? 'hide' : 'show'}
      </button>
    </div>
    <p id={`${id}-hint`} className="mt-2 text-sm text-ink-soft">at least 10 characters.</p>
    {problem && <p id={`${id}-error`} role="alert" className="mt-2 text-sm">{problem}</p>}
  </div>;
}

function GoogleButton({ circle = false, pending, onClick }: { circle?: boolean; pending: boolean; onClick: () => void }) {
  return <button type="button" aria-label="sign in with google" aria-disabled={pending}
    className={`mx-auto block min-h-12 rounded-pill aria-disabled:opacity-50 ${circle ? 'w-12' : 'w-full'}`}
    onClick={onClick}>
    <img src={circle ? googleCircle : googlePill} alt="" width={circle ? 80 : 360} height={80}
      className="block h-auto w-full" draggable={false} />
  </button>;
}

function Divider() {
  return <div className="my-6 flex items-center gap-4 text-sm text-ink-soft" aria-hidden="true">
    <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
  </div>;
}

interface Props { auth?: SignInAuth | null; mode?: 'signin' | 'signup'; children?: ReactNode }

// The allowed accounts-off stub stays until Task 55 lands in staging. Its owner supplies the single client.
export default function SignIn({ auth = null, mode = 'signin', children }: Props) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<AuthAction | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [next, setNext] = useState('/progress');
  const busy = useRef(false);
  const deadline = useRef(0);
  const mounted = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    mounted.current = true;
    const params = new URLSearchParams(window.location.search);
    setNext(safeNext(params.get('next'), window.location.origin));
    setForgot(mode === 'signin' && params.get('reset') === '1');
    return () => { mounted.current = false; };
  }, [mode]);

  useEffect(() => {
    if (seconds === 0) return;
    const timer = window.setInterval(() => setSeconds(resendSeconds(deadline.current, Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [seconds > 0]);

  const submit = async (action: AuthAction) => {
    if (!auth || busy.current || resendSeconds(deadline.current, Date.now()) > 0) return;
    busy.current = true;
    setPending(action);
    setMessage('');
    setProblem(null);
    const outcome = await performAuthAction(auth, action, { email, password, name }, window.location.origin, next);
    if (!mounted.current) return;
    if (outcome.kind === 'invalid') {
      setProblem(outcome);
      const control = form.current?.elements.namedItem(outcome.field === 'name' ? 'display_name' : outcome.field);
      if (control instanceof HTMLInputElement) control.focus();
    } else {
      // Credentials live only in the field and this request. Never persist or log them.
      setPassword('');
      if (outcome.kind === 'oauth') return;
      if (outcome.kind === 'redirect') { window.location.assign(outcome.next); return; }
      setMessage(outcome.message);
      if (outcome.cooldown) {
        deadline.current = Date.now() + 60_000;
        setSeconds(60);
      }
    }
    busy.current = false;
    setPending(null);
  };

  const locked = pending !== null || seconds > 0;
  const switchForgot = (value: boolean) => {
    if (busy.current) return;
    setForgot(value);
    setPassword('');
    setProblem(null);
    setMessage('');
  };
  const destination = `${mode === 'signup' ? '/signin' : '/signup'}?next=${encodeURIComponent(next)}`;

  return <div className="font-body leading-relaxed">
    {children}
    {!auth ? <AccountsUnavailable /> : <>
      {mode === 'signup' && <div className="mb-8 text-center">
        <a href={`#${id}-form`} className={`${authButton} bg-button text-on-button hover:bg-button-hover`}
          onClick={() => form.current?.querySelector('input')?.focus()}>create your free account</a>
        <Divider />
        <GoogleButton pending={locked} onClick={() => { void submit('google'); }} />
        <p className="mt-4 text-sm text-ink-soft">we never post anything for you.</p>
      </div>}
      {mode === 'signup' && <div className="mb-6 text-center">
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-pill bg-surface"
          aria-hidden="true">
          <span className="text-xl">{name.trim() ? initialsFor(name, '') : '+'}</span>
          {name.trim() && <span className="absolute -right-1 bottom-0 flex h-6 w-6 items-center justify-center rounded-pill bg-button text-sm text-on-button">+</span>}
        </div>
        <h2 className="font-display text-accent-lg leading-relaxed">create your account</h2>
        <p className="mt-2 text-ink-soft">save your progress and pick up where you left off.</p>
      </div>}
      {forgot && <h2 className="mb-4 text-lg leading-relaxed">forgot password?</h2>}
      <form ref={form} id={`${id}-form`} noValidate onSubmit={event => {
        event.preventDefault(); void submit(forgot ? 'forgot' : mode);
      }} className="space-y-4 text-left">
        {mode === 'signup' && <div>
          <label htmlFor={`${id}-name`}>display name</label>
          <input id={`${id}-name`} name="display_name" autoComplete="nickname" required maxLength={100}
            value={name} readOnly={pending !== null} onChange={event => { setName(event.target.value); setProblem(null); }}
            className={authInput} aria-invalid={problem?.field === 'name' ? true : undefined}
            aria-describedby={problem?.field === 'name' ? `${id}-name-error` : undefined} />
          {problem?.field === 'name' && <p id={`${id}-name-error`} role="alert" className="mt-2 text-sm">{problem.message}</p>}
        </div>}
        <div>
          <label htmlFor={`${id}-email`}>email</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254}
            value={email} readOnly={pending !== null} onChange={event => { setEmail(event.target.value); setProblem(null); }}
            className={authInput} aria-invalid={problem?.field === 'email' ? true : undefined}
            aria-describedby={problem?.field === 'email' ? `${id}-email-error` : undefined} />
          {problem?.field === 'email' && <p id={`${id}-email-error`} role="alert" className="mt-2 text-sm">{problem.message}</p>}
        </div>
        {!forgot && <PasswordField id={`${id}-password`} value={password} onChange={value => { setPassword(value); setProblem(null); }}
          readOnly={pending !== null} fresh={mode === 'signup'} problem={problem?.field === 'password' ? problem.message : undefined} />}
        {mode === 'signin' && <div className="text-right">
          <button type="button" aria-expanded={forgot} aria-controls={`${id}-form`} className="min-h-12 underline"
            onClick={() => switchForgot(!forgot)}>{forgot ? 'back to sign in' : 'forgot password?'}</button>
        </div>}
        <button type="submit" className={`${authButton} bg-button text-on-button hover:bg-button-hover`}
          aria-disabled={locked} aria-describedby={seconds > 0 ? `${id}-countdown` : undefined}>
          {pending === 'google' ? 'opening google…' : pending ? 'please wait…' : forgot ? 'send reset link' : mode === 'signup' ? 'create account' : 'sign in'}
        </button>
      </form>
      {seconds > 0 && <p id={`${id}-countdown`} className="mt-2 text-sm text-ink-soft">
        you can try again in {seconds} {seconds === 1 ? 'second' : 'seconds'}.
      </p>}
      <p role="status" aria-atomic="true" className="mt-3 text-sm">{message}</p>
      {!forgot && <><Divider /><GoogleButton circle={mode === 'signup'} pending={locked} onClick={() => { void submit('google'); }} /></>}
      <p className="mt-6 text-center text-sm">{mode === 'signup' ? 'already have an account? ' : 'new here? '}
        <a href={destination} className="inline-flex min-h-12 items-center underline">{mode === 'signup' ? 'sign in' : 'create an account'}</a>
      </p>
    </>}
  </div>;
}
